/**
 * scripts/seed.ts — Local initial populate script for BrewIndex
 *
 * Runs the full cask sync locally against the production Neon DB.
 * Use this for the first-time populate: the full 7,659-cask sync takes ~10-12 min
 * and exceeds Vercel's 800s function limit. Daily cron handles incremental updates.
 *
 * Usage: npm run seed
 * Prerequisites: DATABASE_URL must be set in .env.local
 */

import 'dotenv/config';
import { sql, notInArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../src/db/schema';
import { fetchHomebrewCatalog, fetchHomebrewAnalytics, mapHomebrewCask } from '../src/lib/homebrew';

const BATCH_SIZE = 500;

async function seed() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('ERROR: DATABASE_URL is not set. Add it to .env.local and retry.');
    process.exit(1);
  }

  const db = drizzle(dbUrl, { schema });
  const { casks } = schema;

  console.log('Fetching Homebrew catalog and analytics in parallel...');
  const [catalog, analyticsMap] = await Promise.all([
    fetchHomebrewCatalog(),
    fetchHomebrewAnalytics(),
  ]);
  console.log(`Fetched ${catalog.length} casks from Homebrew API.`);

  const rows = catalog.map(cask => mapHomebrewCask(cask, analyticsMap));
  const totalBatches = Math.ceil(rows.length / BATCH_SIZE);

  console.log(`Starting upsert: ${rows.length} casks in ${totalBatches} batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const batch = rows.slice(i, i + BATCH_SIZE);

    process.stdout.write(`  Batch ${batchNum}/${totalBatches} (${batch.length} rows)... `);

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

    console.log('done');
  }

  // Soft-delete casks absent from API (D-08)
  const fetchedTokens = rows.map(r => r.token);
  if (fetchedTokens.length > 0) {
    console.log('Soft-deleting casks absent from current API response...');
    await db
      .update(casks)
      .set({ is_active: false })
      .where(notInArray(casks.token, fetchedTokens));
  }

  console.log(`\nSeed complete. Upserted ${rows.length} casks total.`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
