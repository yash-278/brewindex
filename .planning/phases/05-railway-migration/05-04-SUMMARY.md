---
phase: 05-railway-migration
plan: "04"
subsystem: infra
tags: [railway, vercel, hono, postgres, cron, deployment]

# Dependency graph
requires:
  - phase: 05-01
    provides: node-postgres driver swap and Railway Postgres schema
  - phase: 05-02
    provides: /api/revalidate ISR webhook
  - phase: 05-03
    provides: Hono backend server, sync route, and cron trigger
provides:
  - vercel.json with Vercel cron disabled (Railway cron takes over)
  - backend/railway.toml configuring the persistent Hono web service
  - Human deployment instructions for creating Railway services and completing cutover
affects: [05-railway-migration, deployment, cron, database]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "railway.toml [deploy] block with startCommand and healthcheckPath for persistent Railway web service"
    - "Vercel cron disabled by removing crons array from vercel.json — Railway cron takes over scheduling"

key-files:
  created:
    - backend/railway.toml
  modified:
    - vercel.json

key-decisions:
  - "cronSchedule is NOT set in backend/railway.toml — it belongs on the separate cron-trigger service configured in Railway dashboard"
  - "vercel.json reduced to $schema-only — Vercel cron completely disabled to prevent double-triggering"
  - "railway.toml startCommand uses npx tsx (no compile step) matching the development-run approach"

patterns-established:
  - "Pattern: railway.toml [deploy] block for Railway Hono persistent web service"

requirements-completed:
  - RAIL-01
  - RAIL-02
  - RAIL-03
  - RAIL-04
  - RAIL-05

# Metrics
duration: 8min
completed: "2026-05-25"
---

# Phase 05 Plan 04: Railway Deployment Cutover Summary

**vercel.json Vercel cron disabled and backend/railway.toml created for Railway Hono persistent web service — deployment infrastructure ready for human cutover**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-05-25T07:29:10Z
- **Completed:** 2026-05-25T07:37:00Z
- **Tasks:** 1 auto-completed, 2 human checkpoints (Tasks 2 and 3)
- **Files modified:** 2

## Accomplishments

- Removed Vercel cron config entirely from vercel.json — no more double-trigger risk after Railway cron goes live
- Created backend/railway.toml with startCommand and healthcheckPath for Railway to deploy the Hono persistent HTTP service
- railway.toml intentionally omits cronSchedule — the cron schedule belongs on the separate Railway cron-trigger service configured via Railway dashboard

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove Vercel cron config and create backend/railway.toml** - `3659ab6` (chore)
2. **Task 2: [HUMAN] Deploy Railway services** - `checkpoint:human-action` — awaiting human
3. **Task 3: Smoke test — end-to-end sync on Railway** - `checkpoint:human-verify` — awaiting human

**Plan metadata:** See final commit below

## Files Created/Modified

- `vercel.json` — Reduced to single `$schema` key; crons array and functions.maxDuration entry removed
- `backend/railway.toml` — Railway deployment config: startCommand = "npx tsx backend/src/server.ts", healthcheckPath = "/health"

## Decisions Made

- `cronSchedule` is NOT in `backend/railway.toml`. The Railway cron-trigger service is a separate Railway service (configured in Railway dashboard) whose start command is `npx tsx backend/trigger/cron.ts` and whose cron schedule is `0 */6 * * *`. A persistent Hono HTTP server cannot also be a Railway cron service — Railway cron services must execute and exit, which a persistent server never does.
- `startCommand` uses `npx tsx` (not `tsc` + `node dist/`). This avoids a build step and keeps the Railway deploy simple. `tsx` is already in devDependencies.

## Deviations from Plan

None — Task 1 executed exactly as written. Tasks 2 and 3 are human-action checkpoints as planned.

## Issues Encountered

None during automated execution.

## User Setup Required

**Tasks 2 and 3 require human action.** The deployment steps are in the plan (05-04-PLAN.md Task 2) and repeated here for reference:

### Task 2 — Deploy Railway Services

**Step 1 — Commit and push current changes:**
```
git add src/db/index.ts drizzle.config.ts package.json package-lock.json src/app/api/revalidate/route.ts backend/ vercel.json
git commit -m "feat(05): Railway migration — driver swap, backend scaffold, revalidate webhook"
git push
```

**Step 2 — Create Railway backend service (Hono HTTP server):**
1. Railway dashboard → New Service → Deploy from GitHub repo → brewindex repo → main branch
2. Root Directory: `/` (Railway reads backend/railway.toml from repo root)
3. Confirm start command shows: `npx tsx backend/src/server.ts`
4. Name this service "backend"

**Step 3 — Set backend service environment variables:**
- `DATABASE_URL` = `${{Postgres.DATABASE_URL}}` (Railway variable reference)
- `CRON_SECRET` = (same as Vercel CRON_SECRET)
- `GITHUB_TOKEN` = (your GitHub PAT)
- `BLOB_READ_WRITE_TOKEN` = (from Vercel Blob dashboard)
- `VERCEL_REVALIDATE_URL` = `https://<your-vercel-domain>/api/revalidate`

**Step 4 — Wait for backend service to show Active/healthy status**

**Step 5 — Generate the backend Railway domain** (Settings → Networking → Generate Domain)

**Step 6 — Create Railway cron-trigger service:**
1. New Service → Deploy from GitHub → same repo and branch
2. Root Directory: `/`
3. Override start command: `npx tsx backend/trigger/cron.ts`
4. Set cronSchedule: `0 */6 * * *`
5. Name this service "cron-trigger"

**Step 7 — Set cron-trigger environment variables:**
- `BACKEND_INTERNAL_URL` = `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:3000`
- `CRON_SECRET` = (same CRON_SECRET value)

**Step 8 — Update Vercel DATABASE_URL** to the Railway Postgres connection string

**Step 9 — Redeploy Vercel** to pick up the new DATABASE_URL

**Step 10 — Enable App Sleeping** on the backend service:
Railway dashboard → backend service → Settings → App Sleeping → Enable with 10-minute idle timeout

### Task 3 — Smoke Test

After Task 2 is complete, run these checks (replace `<backend-url>` with your Railway backend domain):

1. `curl https://<backend-url>/health` → `{"ok":true}` (status 200)
2. `curl -X POST https://<backend-url>/sync` → `{"error":"Unauthorized"}` (status 401)
3. Manual sync: `curl -X POST https://<backend-url>/sync -H "Authorization: Bearer <CRON_SECRET>"`
   Expected: returns `{"ok":true,"synced":N,...}` after 30s–5min
4. Visit Vercel browse page — cask grid should show populated casks
5. Check Vercel function logs for `/api/revalidate` 200 response during sync
6. Check Vercel dashboard → Settings → Crons — no active cron jobs listed
7. Check Railway backend service → Settings → App Sleeping — confirm enabled

## Next Phase Readiness

- All code is complete (Plans 01–03); only infrastructure deployment remains (human steps)
- After human deployment (Tasks 2+3), the Railway migration is fully operational
- The frontend on Vercel will query Railway Postgres via the updated DATABASE_URL
- Cask catalog sync will run every 6 hours via Railway cron, calling Vercel /api/revalidate after each sync

---
*Phase: 05-railway-migration*
*Completed: 2026-05-25*
