// One-off migration script: nulls icon_url and icon_is_fallback for all rows where
// icon_url contains 'blob.vercel-storage.com' (Vercel Blob rows).
//
// Run with:
//   dotenv -e .env.local npx tsx scripts/null-icon-urls.ts
//
// The 'dotenv -e .env.local' prefix is required because ESM static imports are hoisted
// before any runtime code executes — without this prefix, the db pool initializes with
// undefined DATABASE_URL and fails before dotenv.config() can run.

import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/db/index';
import { casks } from '../src/db/schema';
import { like } from 'drizzle-orm';

async function main() {
  const result = await db
    .update(casks)
    .set({ icon_url: null, icon_is_fallback: false })
    .where(like(casks.icon_url, '%blob.vercel-storage.com%'));
  console.log('Nulled icon_url for Vercel Blob rows:', result);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
