import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { sql, notInArray, eq, isNull } from 'drizzle-orm';
import { db } from '@/db';
import { casks } from '@/db/schema';
import { fetchHomebrewCatalog, fetchHomebrewAnalytics, mapHomebrewCask } from '@/lib/homebrew';
import { fetchAndStoreIcon } from '@/lib/icons';

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

    // Icon pipeline — only process casks where icon_url IS NULL (incremental guard)
    // This avoids re-uploading all icons on every daily run (~3 min savings)
    const casksNeedingIcons = await db
      .select({ token: casks.token, homepage: casks.homepage })
      .from(casks)
      .where(isNull(casks.icon_url));

    let uploadCount = 0;
    let fallbackCount = 0;

    // Process icons with concurrency cap of 10 (chunks of 10 via Promise.all)
    const ICON_BATCH_SIZE = 10;
    for (let i = 0; i < casksNeedingIcons.length; i += ICON_BATCH_SIZE) {
      const group = casksNeedingIcons.slice(i, i + ICON_BATCH_SIZE);
      await Promise.all(group.map(async (c) => {
        const { url, isFallback } = await fetchAndStoreIcon(c.token, c.homepage ?? '');
        await db
          .update(casks)
          .set({ icon_url: url, icon_is_fallback: isFallback })
          .where(eq(casks.token, c.token));
        if (isFallback) {
          fallbackCount++;
        } else {
          uploadCount++;
        }
      }));
    }

    revalidateTag('casks', 'max');

    return new Response(JSON.stringify({ ok: true, synced: rows.length, icons_uploaded: uploadCount, icons_fallback: fallbackCount }), {
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
