import type { Context } from 'hono';
import { db } from '../../../src/db/index';
import { casks } from '../../../src/db/schema';
import { extractGithubRepo, fetchGithubStats } from '../../../src/lib/github';
import { fetchHomebrewAnalytics, fetchHomebrewCatalog, mapHomebrewCask } from '../../../src/lib/homebrew';
import { fetchAndStoreIcon } from '../../../src/lib/icons';
import { logger } from '../lib/logger';
import { and, eq, isNull, like, notInArray, sql } from 'drizzle-orm';

const BATCH_SIZE = 500;

async function runSync() {
  const jobStart = Date.now();
  const job: Record<string, unknown> = { outcome: 'unknown' };

  try {
    // Stage 1: fetch catalog + analytics
    logger.info('sync.fetch_start');
    const fetchStart = Date.now();
    const [catalog, analyticsMap] = await Promise.all([fetchHomebrewCatalog(), fetchHomebrewAnalytics()]);
    const rows = catalog.map((cask) => mapHomebrewCask(cask, analyticsMap));
    logger.info('sync.fetch_done', { catalog_count: rows.length, duration_ms: Date.now() - fetchStart });
    job.catalog_count = rows.length;

    // Stage 2: batch upsert (500-row chunks)
    logger.info('sync.upsert_start', { batches: Math.ceil(rows.length / BATCH_SIZE) });
    const upsertStart = Date.now();
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      await db
        .insert(casks)
        .values(batch)
        .onConflictDoUpdate({
          target: casks.token,
          set: {
            name: sql`excluded.name`,
            description: sql`excluded.description`,
            version: sql`excluded.version`,
            homepage: sql`excluded.homepage`,
            install_30d: sql`excluded.install_30d`,
            install_90d: sql`excluded.install_90d`,
            install_365d: sql`excluded.install_365d`,
            is_active: sql`excluded.is_active`,
            last_synced_at: sql`excluded.last_synced_at`,
          },
        });
      logger.info('sync.upsert_batch', { batch: Math.floor(i / BATCH_SIZE) + 1, offset: i, duration_ms: Date.now() - upsertStart });
    }

    // Soft-delete casks absent from API
    const fetchedTokens = rows.map((r) => r.token);
    if (fetchedTokens.length > 0) {
      await db.update(casks).set({ is_active: false }).where(notInArray(casks.token, fetchedTokens));
    }
    logger.info('sync.upsert_done', { synced: rows.length, duration_ms: Date.now() - upsertStart });
    job.upsert_duration_ms = Date.now() - upsertStart;

    // Stage 3: icon pipeline (incremental — only NULL icon_url rows)
    const casksNeedingIcons = await db
      .select({ token: casks.token, homepage: casks.homepage })
      .from(casks)
      .where(and(isNull(casks.icon_url), eq(casks.is_active, true)));

    logger.info('sync.icons_start', { pending: casksNeedingIcons.length });
    const iconStart = Date.now();
    let uploadCount = 0;
    let fallbackCount = 0;

    const ICON_BATCH_SIZE = 10;
    for (let i = 0; i < casksNeedingIcons.length; i += ICON_BATCH_SIZE) {
      const group = casksNeedingIcons.slice(i, i + ICON_BATCH_SIZE);
      await Promise.all(
        group.map(async (c) => {
          try {
            const { url, isFallback } = await fetchAndStoreIcon(c.token, c.homepage ?? "");
            await db.update(casks).set({ icon_url: url, icon_is_fallback: isFallback }).where(eq(casks.token, c.token));
            if (isFallback) fallbackCount++;
            else uploadCount++;
          } catch (err) {
            logger.error('sync.icon_failed', { token: c.token, error: String(err) });
          }
        }),
      );
    }
    logger.info('sync.icons_done', { uploaded: uploadCount, fallback: fallbackCount, duration_ms: Date.now() - iconStart });
    job.icons_uploaded = uploadCount;
    job.icons_fallback = fallbackCount;
    job.icons_duration_ms = Date.now() - iconStart;

    // Stage 4: GitHub enrichment
    const githubCasks = await db
      .select({ token: casks.token, homepage: casks.homepage })
      .from(casks)
      .where(and(like(casks.homepage, "%github.com%"), eq(casks.is_active, true)));

    logger.info('sync.github_start', { candidates: githubCasks.length });
    const githubStart = Date.now();
    let githubEnriched = 0;
    let githubFailed = 0;

    for (const cask of githubCasks) {
      const parsed = extractGithubRepo(cask.homepage ?? "");
      if (!parsed) continue;

      const stats = await fetchGithubStats(parsed.owner, parsed.repo);
      if (stats === null) {
        await db.update(casks).set({ github_enriched: false }).where(eq(casks.token, cask.token));
        githubFailed++;
      } else {
        await db
          .update(casks)
          .set({ github_stars: stats.stars, github_forks: stats.forks, github_issues: stats.issues, github_enriched: true })
          .where(eq(casks.token, cask.token));
        githubEnriched++;
      }
    }
    logger.info('sync.github_done', { enriched: githubEnriched, failed: githubFailed, duration_ms: Date.now() - githubStart });
    job.github_enriched = githubEnriched;
    job.github_failed = githubFailed;
    job.github_duration_ms = Date.now() - githubStart;

    // Stage 5: ISR revalidation
    logger.info('sync.revalidate_start');
    await fetch(process.env.VERCEL_REVALIDATE_URL!, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    logger.info('sync.revalidate_done');

    job.outcome = 'success';
  } catch (err) {
    job.outcome = 'error';
    job.error = String(err);
    logger.error('sync.fatal', { error: String(err) });
    throw err;
  } finally {
    // Wide event — single structured line summarising the entire job
    logger.info('sync.complete', { ...job, total_duration_ms: Date.now() - jobStart });
  }
}

export async function syncHandler(c: Context) {
  const start = Date.now();

  const authHeader = c.req.header('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    logger.error('sync.request', { status: 401, outcome: 'unauthorized', duration_ms: Date.now() - start });
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL_REVALIDATE_URL"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    logger.error('sync.request', { status: 500, outcome: 'misconfigured', missing_vars: missing, duration_ms: Date.now() - start });
    return c.json({ ok: false, error: 'Server misconfiguration' }, 500);
  }

  // Respond 202 immediately — undici headersTimeout is 30s, sync takes 5+ min
  setImmediate(() => {
    runSync().catch((err) => logger.error('sync.background_error', { error: String(err) }));
  });

  logger.info('sync.request', { status: 202, outcome: 'accepted', duration_ms: Date.now() - start });
  return c.json({ ok: true, message: 'Sync started' }, 202);
}
