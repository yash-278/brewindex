import type { Context } from 'hono';
import { db } from '../../../src/db/index';
import { casks } from '../../../src/db/schema';
import { extractGithubRepo, fetchGithubStats } from '../../../src/lib/github';
import { fetchHomebrewAnalytics, fetchHomebrewCatalog, mapHomebrewCask } from '../../../src/lib/homebrew';
import { fetchAndStoreIcon } from '../../../src/lib/icons';
import { and, eq, isNull, like, notInArray, sql } from 'drizzle-orm';

const BATCH_SIZE = 500;

export async function syncHandler(c: Context) {
  // CRON_SECRET guard — must be first, before any work
  const authHeader = c.req.header('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL_REVALIDATE_URL"].filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return c.json({ ok: false, missing }, 500);
  }

  try {
    // Fetch catalog and analytics in parallel
    const [catalog, analyticsMap] = await Promise.all([fetchHomebrewCatalog(), fetchHomebrewAnalytics()]);

    // Map all casks to CaskInsertRow
    const rows = catalog.map((cask) => mapHomebrewCask(cask, analyticsMap));

    // Batch upsert in BATCH_SIZE chunks (500-row batches: ~5s vs ~383s for individual inserts)
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
    }

    // Soft-delete casks absent from API (D-08)
    // Build Set of all fetched tokens, mark anything NOT in the set as inactive
    const fetchedTokens = rows.map((r) => r.token);
    if (fetchedTokens.length > 0) {
      await db.update(casks).set({ is_active: false }).where(notInArray(casks.token, fetchedTokens));
    }

    // Icon pipeline — only process casks where icon_url IS NULL (incremental guard)
    // This avoids re-uploading all icons on every daily run (~3 min savings)
    const casksNeedingIcons = await db
      .select({ token: casks.token, homepage: casks.homepage })
      .from(casks)
      .where(and(isNull(casks.icon_url), eq(casks.is_active, true)));

    let uploadCount = 0;
    let fallbackCount = 0;

    // Process icons with concurrency cap of 10 (chunks of 10 via Promise.all)
    const ICON_BATCH_SIZE = 10;
    for (let i = 0; i < casksNeedingIcons.length; i += ICON_BATCH_SIZE) {
      const group = casksNeedingIcons.slice(i, i + ICON_BATCH_SIZE);
      await Promise.all(
        group.map(async (c) => {
          try {
            const { url, isFallback } = await fetchAndStoreIcon(c.token, c.homepage ?? "");
            await db.update(casks).set({ icon_url: url, icon_is_fallback: isFallback }).where(eq(casks.token, c.token));
            if (isFallback) {
              fallbackCount++;
            } else {
              uploadCount++;
            }
          } catch (err) {
            console.warn("[sync] icon failed for", c.token, err);
          }
        }),
      );
    }

    // GitHub enrichment — final enrichment step before ISR invalidation
    // D-02 correction: only 1,083 casks have github.com homepages — single sequential pass,
    // no sleep loops needed. @octokit/plugin-throttling handles rate limits automatically.
    const githubCasks = await db
      .select({ token: casks.token, homepage: casks.homepage })
      .from(casks)
      .where(and(like(casks.homepage, "%github.com%"), eq(casks.is_active, true)));

    let githubEnriched = 0;
    let githubFailed = 0;

    // Sequential loop (NOT Promise.all) to let @octokit/plugin-throttling manage rate limits
    // T-04-03: throttling plugin handles primary (5K/hr) and secondary (900/min) limits
    for (const cask of githubCasks) {
      const parsed = extractGithubRepo(cask.homepage ?? "");
      // Skip non-repo GitHub URLs (codeql.github.com, docs.github.com) and excluded owners (googlefonts)
      if (!parsed) continue;

      const stats = await fetchGithubStats(parsed.owner, parsed.repo);
      if (stats === null) {
        // D-04: 404 or inaccessible repo — set github_enriched = false, leave stats as NULL
        await db.update(casks).set({ github_enriched: false }).where(eq(casks.token, cask.token));
        githubFailed++;
      } else {
        await db
          .update(casks)
          .set({
            github_stars: stats.stars,
            github_forks: stats.forks,
            github_issues: stats.issues,
            github_enriched: true,
          })
          .where(eq(casks.token, cask.token));
        githubEnriched++;
      }
    }

    // Call Vercel revalidation webhook (ISR cache invalidation — Next.js-only API called via HTTP)
    await fetch(process.env.VERCEL_REVALIDATE_URL!, {
      method: 'GET',
      headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    return c.json({ ok: true, synced: rows.length, icons_uploaded: uploadCount, icons_fallback: fallbackCount, github_enriched: githubEnriched, github_failed: githubFailed }, 200);
  } catch (err) {
    console.error('[sync] fatal error', err);
    return c.json({ ok: false, error: String(err) }, 500);
  }
}
