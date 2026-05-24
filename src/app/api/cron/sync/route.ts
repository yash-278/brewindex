import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { sql, notInArray } from 'drizzle-orm';
import { db } from '@/db';
import { casks } from '@/db/schema';
import { fetchHomebrewCatalog, fetchHomebrewAnalytics, mapHomebrewCask } from '@/lib/homebrew';

export const maxDuration = 800; // Pro plan max — required for full sync

const BATCH_SIZE = 500;

export async function GET(request: NextRequest) {
  // CRON_SECRET guard — must be first, before any work
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const missing = ['DATABASE_URL', 'CRON_SECRET']
    .filter(k => !process.env[k]);
  if (missing.length > 0) {
    return new Response(JSON.stringify({ ok: false, missing }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Fetch catalog and analytics in parallel
    const [catalog, analyticsMap] = await Promise.all([
      fetchHomebrewCatalog(),
      fetchHomebrewAnalytics(),
    ]);

    // Map all casks to CaskInsertRow
    const rows = catalog.map(cask => mapHomebrewCask(cask, analyticsMap));

    // Batch upsert in BATCH_SIZE chunks (500-row batches: ~5s vs ~383s for individual inserts)
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db
        .insert(casks)
        .values(batch)
        .onConflictDoUpdate({
          target: casks.token,
          set: {
            name:           sql`excluded.name`,
            description:    sql`excluded.description`,
            version:        sql`excluded.version`,
            homepage:       sql`excluded.homepage`,
            install_30d:    sql`excluded.install_30d`,
            install_90d:    sql`excluded.install_90d`,
            install_365d:   sql`excluded.install_365d`,
            is_active:      sql`excluded.is_active`,
            last_synced_at: sql`excluded.last_synced_at`,
          },
        });
    }

    // Soft-delete casks absent from API (D-08)
    // Build Set of all fetched tokens, mark anything NOT in the set as inactive
    const fetchedTokens = rows.map(r => r.token);
    if (fetchedTokens.length > 0) {
      await db
        .update(casks)
        .set({ is_active: false })
        .where(notInArray(casks.token, fetchedTokens));
    }

    revalidateTag('casks', 'max');

    return new Response(JSON.stringify({ ok: true, synced: rows.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[cron/sync] fatal error', err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
