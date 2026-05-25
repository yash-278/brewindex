// Railway cron service entry point — calls POST /sync on Hono server and exits
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const CRON_SECRET = process.env.CRON_SECRET;
if (!BACKEND_INTERNAL_URL || !CRON_SECRET) {
  console.error('[cron] missing env vars: BACKEND_INTERNAL_URL and CRON_SECRET are required');
  process.exit(1);
}

async function trigger() {
  const res = await fetch(`${BACKEND_INTERNAL_URL}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) {
    console.error('[cron] sync failed', res.status, await res.text());
    process.exit(1);
  }
  console.log('[cron] sync triggered', await res.json());
  process.exit(0);
}

trigger().catch((err) => {
  console.error('[cron] trigger error', err);
  process.exit(1);
});
