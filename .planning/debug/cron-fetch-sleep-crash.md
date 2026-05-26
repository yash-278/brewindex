---
status: resolved
trigger: "Railway cron job (brewsync) crashes with TypeError: fetch failed when the brewindex backend service is sleeping. The cron service calls http://brewindex.railway.internal:8080 to trigger sync, but the sleeping service doesn't respond."
created: 2026-05-26
updated: 2026-05-26
resolved: 2026-05-26
---

# Debug Session: cron-fetch-sleep-crash

## Symptoms

- **Expected behavior:** The cron job should wake the sleeping Railway server, then the sync job completes successfully
- **Actual behavior:** The cron job (brewsync) immediately gets `TypeError: fetch failed` when the target brewindex service is sleeping on Railway
- **Error messages:** `service: brewsync version: 0.1.0 env: production error: TypeError: fetch failed ts: 2026-05-26T06:04:03.554Z event: cron.trigger_error`
- **Timeline:** Happening on every cron trigger when the brewindex service has gone to sleep (sleeping mode)
- **Reproduction:** Wait for Railway to put the brewindex service to sleep (idle timeout), then let the cron job fire. The fetch to `http://brewindex.railway.internal:8080` fails immediately.

## Architecture

- **brewindex** — Railway web service (Hono backend), sleeps when idle, internal URL: `http://brewindex.railway.internal:8080`
- **brewsync** — Railway cron service, triggers every 6 hours, calls the brewindex service to run sync
- The cron service does a fetch to the brewindex service's internal Railway URL
- Railway's internal networking does NOT auto-wake sleeping services on internal requests

## Current Focus

- hypothesis: "Railway private networking (*.railway.internal) does not wake sleeping services — the fetch connection is refused or times out immediately because the target service is not running"
- test: "Check the cron trigger script to see how it calls the brewindex service and whether it has any retry/wake logic"
- expecting: "The cron script does a single fetch with no retry, no timeout handling, and no wake-up mechanism"
- next_action: "Read the cron trigger script in backend/ to understand the current fetch logic and determine the fix approach"

## Evidence

- timestamp: 2026-05-26T06:04 — Railway logs show `TypeError: fetch failed` from brewsync when brewindex is sleeping
- timestamp: 2026-05-26 — Confirmed `backend/trigger/cron.ts` does single fetch with no retry, no timeout, no error handling for connection failures
- timestamp: 2026-05-26 — Railway docs confirm private networking (*.railway.internal) does NOT wake sleeping services

## Eliminated

## Resolution

- root_cause: "The cron trigger script (`backend/trigger/cron.ts`) performed a single fetch to the Railway internal URL with no retry logic. Railway private networking does not auto-wake sleeping services, so when the brewindex service was sleeping, the TCP connection was immediately refused causing `TypeError: fetch failed`."
- fix: "Added retry logic with exponential backoff (5 retries, 2s→4s→8s→16s→30s delays) and a 30s request timeout with AbortController. The script now retries on connection errors (`fetch failed`, `ECONNREFUSED`, `ECONNRESET`, timeouts) giving the service time to wake up from sleep. Also added structured logging for each retry attempt."
- verification: "TypeScript compiles cleanly. Next deploy of brewsync will exercise the retry path when brewindex is sleeping."
- files_changed: backend/trigger/cron.ts
