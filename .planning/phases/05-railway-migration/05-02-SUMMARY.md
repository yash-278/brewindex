---
phase: 05-railway-migration
plan: "02"
subsystem: api
tags: [next.js, isr, revalidatetag, cache, webhook, cron-secret]

# Dependency graph
requires:
  - phase: 01-data-pipeline
    provides: CRON_SECRET env var and revalidateTag('casks') convention established in sync/route.ts
provides:
  - GET /api/revalidate webhook that invalidates ISR cache on valid CRON_SECRET bearer token
  - Bridge endpoint for Railway Hono sync service to trigger Next.js cache invalidation
affects:
  - 05-03 (Railway sync service will call this webhook via VERCEL_REVALIDATE_URL env var)
  - 05-04 (vercel.json cron removal plan depends on this webhook being in place)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - revalidateTag webhook pattern — lightweight GET route calling revalidateTag, protected by CRON_SECRET, no DB work

key-files:
  created:
    - src/app/api/revalidate/route.ts
  modified: []

key-decisions:
  - "Use Response.json() (Web API style) rather than new Response(JSON.stringify()) for cleaner trivial handler"
  - "No maxDuration export — revalidateTag executes synchronously in milliseconds, not seconds"
  - "No rate limiting on this endpoint — CRON_SECRET guard is sufficient; attack surface is minimal per T-05-05 accepted threat"

patterns-established:
  - "revalidateTag webhook: GET handler, CRON_SECRET bearer guard first, revalidateTag call, no DB imports"

requirements-completed:
  - RAIL-02

# Metrics
duration: 2min
completed: "2026-05-25"
---

# Phase 5 Plan 02: Railway Migration — ISR Revalidation Webhook Summary

**Next.js-side GET /api/revalidate webhook with CRON_SECRET bearer auth calls revalidateTag('casks', 'max') to bridge Railway sync → Vercel ISR invalidation**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-25T06:46:03Z
- **Completed:** 2026-05-25T06:47:20Z
- **Tasks:** 1 of 1
- **Files modified:** 1

## Accomplishments

- Created `src/app/api/revalidate/route.ts` — the Vercel-side ISR invalidation webhook
- CRON_SECRET bearer auth guard copied verbatim from `sync/route.ts` lines 16–18 pattern
- Calls `revalidateTag('casks', 'max')` — same two tags invalidated by the existing sync route
- Zero database imports; route completes in milliseconds

## Task Commits

1. **Task 1: Create GET /api/revalidate webhook route handler** - `aee3554` (feat)

**Plan metadata:** committed with SUMMARY.md (docs commit follows)

## Files Created/Modified

- `src/app/api/revalidate/route.ts` — GET handler that validates CRON_SECRET bearer token, calls revalidateTag('casks', 'max'), returns {revalidated: true, now: Date.now()}

## Decisions Made

- Used `Response.json()` (Web API style) instead of `new Response(JSON.stringify(...), {headers})` for cleaner minimal handler — consistent with PATTERNS.md recommendation for this route
- No `maxDuration` export: revalidateTag is synchronous and exits in <10ms, so Vercel's default function timeout is more than adequate
- No rate limiting: CRON_SECRET guard is the only caller authentication needed; T-05-05 threat accepted per plan threat model

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no new external service configuration required for this plan. The `CRON_SECRET` env var is already established from Phase 01. The Railway sync service (Plan 05-03) must set `VERCEL_REVALIDATE_URL` to point to this endpoint.

## Next Phase Readiness

- `GET /api/revalidate` is live and ready to receive calls from the Railway Hono sync service
- Plan 05-03 (Railway backend scaffold) can now reference `VERCEL_REVALIDATE_URL` pointing at this endpoint
- TypeScript passes cleanly — no type errors introduced

---
*Phase: 05-railway-migration*
*Completed: 2026-05-25*
