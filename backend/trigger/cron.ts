// Railway cron service entry point — calls POST /sync on Hono server and exits
import { logger } from '../src/lib/logger';

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const CRON_SECRET = process.env.CRON_SECRET;
if (!BACKEND_INTERNAL_URL || !CRON_SECRET) {
  logger.error('cron.start', { outcome: 'misconfigured', error: 'BACKEND_INTERNAL_URL and CRON_SECRET are required' });
  process.exit(1);
}

async function trigger() {
  const start = Date.now();
  logger.info('cron.trigger_start', { url: BACKEND_INTERNAL_URL });

  const res = await fetch(`${BACKEND_INTERNAL_URL}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });

  const body = await res.json();
  if (!res.ok) {
    logger.error('cron.trigger_done', { status: res.status, outcome: 'error', body, duration_ms: Date.now() - start });
    process.exit(1);
  }

  logger.info('cron.trigger_done', { status: res.status, outcome: 'accepted', body, duration_ms: Date.now() - start });
  process.exit(0);
}

trigger().catch((err) => {
  logger.error('cron.trigger_error', { error: String(err) });
  process.exit(1);
});
