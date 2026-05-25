// One-off migration script: nulls icon_url and icon_is_fallback for all rows where
// icon_url contains 'blob.vercel-storage.com' (Vercel Blob rows).
//
// Run with:
//   npx tsx scripts/null-icon-urls.ts
//
// Dynamic imports are used so that dotenv.config() runs before the db pool
// initializes — static imports are hoisted and would cause DATABASE_URL to be
// undefined when new Pool() is called.

import { config } from 'dotenv';
config({ path: '.env.local' });

async function main() {
  const { db } = await import('../src/db/index');
  const { casks } = await import('../src/db/schema');
  const { like } = await import('drizzle-orm');

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
