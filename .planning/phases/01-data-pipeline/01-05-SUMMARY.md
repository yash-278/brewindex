---
phase: 01-data-pipeline
plan: "05"
subsystem: security-hardening
tags: [ssrf, rate-limiting, reliability, fluid-compute, drizzle]
dependency_graph:
  requires: ["01-04"]
  provides: ["SECU-04-complete", "DATA-03-complete"]
  affects: ["src/lib/fetch-allowlist.ts", "src/lib/github.ts", "src/app/api/cron/sync/route.ts", "vercel.json"]
tech_stack:
  added: []
  patterns:
    - Per-entry try/catch inside Promise.all to isolate async failures
    - Vercel Fluid Compute opt-in via functions block in vercel.json
    - Drizzle and() combinator for multi-condition WHERE clauses
key_files:
  modified:
    - src/lib/fetch-allowlist.ts
    - src/lib/github.ts
    - src/app/api/cron/sync/route.ts
    - vercel.json
decisions:
  - "172.16/12 prefixes added as 16 individual string entries matching existing startsWith() check pattern"
  - "onSecondaryRateLimit now mirrors onRateLimit: retryCount < 2 instead of always-true"
  - "is_active filter added to both icon and GitHub queries to skip soft-deleted casks"
  - "Fluid Compute enabled via vercel.json functions block (not just maxDuration export in route)"
metrics:
  duration: "8 minutes"
  completed: "2026-05-24T12:02:38Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 01 Plan 05: Gap Closure — SSRF, Retry Cap, Env Validation, Icon Resilience Summary

Close all six gaps found during Phase 1 verification: complete RFC 1918 SSRF block (172.16/12 range), env startup validation for GITHUB_TOKEN and BLOB_READ_WRITE_TOKEN, GitHub retry cap, per-icon fault isolation in Promise.all, Fluid Compute opt-in, and is_active filters on both DB queries.

## Tasks Completed

| Task | Name | Commit | Files Modified |
|------|------|--------|----------------|
| 1 | Complete SSRF protection and harden GitHub retry cap | 6895616 | src/lib/fetch-allowlist.ts, src/lib/github.ts |
| 2 | Env validation, icon reliability, Fluid Compute opt-in, is_active filters | 02ef0c2 | src/app/api/cron/sync/route.ts, vercel.json |

## What Was Built

**Task 1 — SSRF + retry hardening:**

- `src/lib/fetch-allowlist.ts`: Expanded `BLOCKED_CIDR_PREFIXES` from 5 to 21 entries. Added all 16 entries for the `172.16.0.0/12` range (`172.16.` through `172.31.`). The existing `Array.some + startsWith` check logic is unchanged — only the array contents expanded.
- `src/lib/github.ts`: Updated `onSecondaryRateLimit` handler to accept `retryCount` as the fourth parameter and return `retryCount < 2`, exactly mirroring the existing `onRateLimit` pattern. Prevents unbounded retry loops on GitHub secondary rate limits.

**Task 2 — Route hardening:**

- `src/app/api/cron/sync/route.ts`:
  - Added `GITHUB_TOKEN` and `BLOB_READ_WRITE_TOKEN` to the startup env validation array (line 21). Missing either now returns HTTP 500 before any sync work begins.
  - Added `and` import from `drizzle-orm` to support composite WHERE clauses.
  - Added `eq(casks.is_active, true)` to the icon pipeline query (icon fetch only processes active casks).
  - Wrapped the per-icon `fetchAndStoreIcon` + `db.update` inside a `try/catch`; failures are logged with `console.warn('[cron/sync] icon failed for', c.token, err)` and swallowed so the rest of the batch continues.
  - Added `eq(casks.is_active, true)` to the GitHub enrichment query (enrichment only processes active casks).
- `vercel.json`: Added `functions` block mapping `app/api/cron/sync/route` to `{ "maxDuration": 800 }`. This is the Vercel Fluid Compute opt-in required for durations >300s on Pro plan — the `export const maxDuration = 800` in the route file alone does not enable Fluid Compute without this config entry.

## Verification Results

| Gap | Check | Result |
|-----|-------|--------|
| SECU-04: 172.16/12 range | grep -c "172." (excluding startsWith line) | 16 entries |
| DATA-03: env validation | GITHUB_TOKEN + BLOB_READ_WRITE_TOKEN in missing array | Pass |
| github.ts retry cap | `retryCount < 2` in onSecondaryRateLimit body | Pass |
| CR-01: per-icon try/catch | console.warn count >= 1 | 1 |
| CR-04: Fluid Compute | maxDuration: 800 in vercel.json functions block | Pass |
| WR-01/WR-03: is_active filters | 2 WHERE clauses with is_active=true | Pass |
| TypeScript clean | tsc --noEmit error count | 0 |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all four files contain complete, production-ready implementations with no placeholder values.

## Threat Flags

No new security surface introduced. All changes are hardening/correctness fixes to existing boundaries listed in the plan's threat model.

## Self-Check: PASSED

Files confirmed present:
- src/lib/fetch-allowlist.ts — modified with 21-entry BLOCKED_CIDR_PREFIXES
- src/lib/github.ts — modified with capped onSecondaryRateLimit
- src/app/api/cron/sync/route.ts — modified with 4 changes
- vercel.json — modified with Fluid Compute functions block

Commits confirmed:
- 6895616 — fix(01-05): complete SSRF protection and cap GitHub retry loop
- 02ef0c2 — fix(01-05): env validation, icon resilience, Fluid Compute, is_active filters
