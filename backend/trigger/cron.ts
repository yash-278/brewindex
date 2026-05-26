// Railway cron service entry point — calls POST /sync on Hono server and exits.
// Retries with exponential backoff to handle the target service waking from sleep.
// Railway private networking does NOT auto-wake sleeping services, so the first
// few attempts may fail with connection errors while the service cold-starts.
import { logger } from '../src/lib/logger';

const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const CRON_SECRET = process.env.CRON_SECRET;
if (!BACKEND_INTERNAL_URL || !CRON_SECRET) {
  logger.error('cron.start', { outcome: 'misconfigured', error: 'BACKEND_INTERNAL_URL and CRON_SECRET are required' });
  process.exit(1);
}

// Retry config — tuned for Railway cold-start (typically 5-15s)
const MAX_RETRIES = 5;
const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 30_000;
const REQUEST_TIMEOUT_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBackoffDelay(attempt: number): number {
  // Exponential backoff: 2s, 4s, 8s, 16s, 30s (capped)
  const delay = INITIAL_DELAY_MS * Math.pow(2, attempt);
  return Math.min(delay, MAX_DELAY_MS);
}

function isRetryableError(err: unknown): boolean {
  const msg = String(err);
  // Connection refused, reset, timeout — all indicate sleeping/starting service
  return (
    msg.includes('fetch failed') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('UND_ERR_CONNECT_TIMEOUT') ||
    msg.includes('AbortError') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('socket hang up')
  );
}

async function triggerWithRetry(): Promise<void> {
  const start = Date.now();
  logger.info('cron.trigger_start', { url: BACKEND_INTERNAL_URL, max_retries: MAX_RETRIES });

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      const res = await fetch(`${BACKEND_INTERNAL_URL}/sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${CRON_SECRET}` },
        signal: controller.signal,
      });

      clearTimeout(timeout);

      const body = await res.json();

      if (!res.ok) {
        logger.error('cron.trigger_done', {
          status: res.status,
          outcome: 'error',
          body,
          attempt,
          duration_ms: Date.now() - start,
        });
        process.exit(1);
      }

      logger.info('cron.trigger_done', {
        status: res.status,
        outcome: 'accepted',
        body,
        attempt,
        duration_ms: Date.now() - start,
      });
      process.exit(0);
    } catch (err) {
      lastError = err;

      if (!isRetryableError(err) || attempt === MAX_RETRIES) {
        break;
      }

      const delay = getBackoffDelay(attempt);
      logger.info('cron.trigger_retry', {
        attempt,
        next_attempt: attempt + 1,
        delay_ms: delay,
        error: String(err),
      });
      await sleep(delay);
    }
  }

  // All retries exhausted
  logger.error('cron.trigger_error', {
    error: String(lastError),
    outcome: 'retries_exhausted',
    max_retries: MAX_RETRIES,
    duration_ms: Date.now() - start,
  });
  process.exit(1);
}

triggerWithRetry();
