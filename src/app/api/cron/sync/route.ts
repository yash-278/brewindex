import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { sql } from 'drizzle-orm';
import { db } from '@/db';
import { casks } from '@/db/schema';
import type { CaskInsertRow } from '@/db/schema';
import { safeFetch } from '@/lib/fetch-allowlist';

export const maxDuration = 800;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const missing = ['DATABASE_URL', 'CRON_SECRET', 'GITHUB_TOKEN', 'BLOB_READ_WRITE_TOKEN']
    .filter(k => !process.env[k]);
  if (missing.length > 0) {
    return new Response(JSON.stringify({ ok: false, missing }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await safeFetch('https://formulae.brew.sh/api/cask/firefox.json');
    if (!res.ok) throw new Error(`Homebrew API error: ${res.status}`);
    const cask = await res.json() as {
      token: string;
      name: string[];
      desc?: string | null;
      version: string;
      homepage: string;
      deprecated: boolean;
      disabled: boolean;
    };

    const row: CaskInsertRow = {
      token:         cask.token,
      name:          cask.name[0],
      description:   cask.desc ?? null,
      version:       cask.version,
      homepage:      cask.homepage,
      install_30d:   0,
      install_90d:   0,
      install_365d:  0,
      is_active:     !cask.deprecated && !cask.disabled,
      last_synced_at: new Date(),
    };

    await db
      .insert(casks)
      .values([row])
      .onConflictDoUpdate({
        target: casks.token,
        set: {
          name:           sql`excluded.name`,
          description:    sql`excluded.description`,
          version:        sql`excluded.version`,
          is_active:      sql`excluded.is_active`,
          last_synced_at: sql`excluded.last_synced_at`,
        },
      });

    revalidateTag('casks', 'max');

    return new Response(JSON.stringify({ ok: true, synced: 1 }), {
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
