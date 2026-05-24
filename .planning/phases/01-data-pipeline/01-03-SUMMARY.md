---
phase: 01-data-pipeline
plan: "03"
subsystem: infra
tags: [vercel-blob, duckduckgo-favicon, icon-pipeline, cron, drizzle-orm]

# Dependency graph
requires:
  - phase: 01-02
    provides: "src/lib/homebrew.ts, full cron route with batch upsert and soft-delete, scripts/seed.ts"
  - phase: 01-01
    provides: "src/lib/fetch-allowlist.ts (safeFetch), src/db/schema.ts (casks table with icon_url/icon_is_fallback)"
provides:
  - "src/lib/icons.ts — fetchAndStoreIcon(token, homepage) with DuckDuckGo favicon fetch and Vercel Blob upload"
  - "Cron route updated with incremental icon pipeline (isNull guard), concurrency cap of 10, DB update of icon_url and icon_is_fallback"
  - "Success response includes icons_uploaded and icons_fallback counts"
affects:
  - "01-04 (GitHub enrichment plan extends same cron route)"
  - "Phase 2 catalog UI — icon_url column now populated from Vercel Blob; icon_is_fallback drives CSS initials fallback"

# Tech tracking
tech-stack:
  added:
    - "@vercel/blob put() for icon upload at icons/{token}.ico with public access"
    - "drizzle-orm isNull() and eq() for incremental icon query and per-row update"
  patterns:
    - "DuckDuckGo 404 detection via HTTP status (res.status !== 200), NOT body length — PNG body returned on both 200 and 404"
    - "Incremental guard: query casks WHERE icon_url IS NULL before icon pipeline (skips re-upload on subsequent runs)"
    - "Concurrency-capped async pool: chunk array into groups of N, await Promise.all per group"
    - "safeFetch() for all outbound HTTP — no raw fetch() in icon service"

key-files:
  created:
    - src/lib/icons.ts
  modified:
    - src/app/api/cron/sync/route.ts

key-decisions:
  - "DuckDuckGo 404 detection uses HTTP status code (res.status !== 200) — body content cannot be used because DuckDuckGo returns a real PNG body on both 200 and 404"
  - "Icon pipeline runs after soft-delete, before revalidateTag — ensures all upserted casks are considered for icon fetch"
  - "Concurrency cap of 10 keeps Blob ops below 75 ops/sec Pro tier limit (10 concurrent requests with network latency stays comfortably within limit)"
  - "Invalid homepage (empty string, bad URL) caught with try/catch around new URL() — returns isFallback immediately without throwing into cron route"

patterns-established:
  - "Icon pipeline pattern: query for nulls → chunk → Promise.all → DB update per row"
  - "Vercel Blob upload: put(path, buffer, { access: 'public', contentType, allowOverwrite: true }) — SDK reads BLOB_READ_WRITE_TOKEN automatically"

requirements-completed:
  - DATA-02

# Metrics
duration: ~2min
completed: 2026-05-24
---

# Phase 01 Plan 03: Icon Pipeline Summary

DuckDuckGo favicon fetch with HTTP-status 404 detection, Vercel Blob upload at `icons/{token}.ico`, and incremental cron integration that skips casks already having `icon_url` set.

## Performance

- **Duration:** ~2 min
- **Started:** 2026-05-24T10:47:59Z
- **Completed:** 2026-05-24T10:49:35Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/lib/icons.ts` with `fetchAndStoreIcon` — uses `safeFetch` (SSRF-safe), checks `res.status !== 200` for DuckDuckGo 404 detection, uploads icon buffer to Vercel Blob at `icons/{token}.ico`
- Wired icon pipeline into cron route with `isNull(casks.icon_url)` incremental guard — daily runs only process new casks, not all 7,659
- Concurrency-capped processing (groups of 10 via `Promise.all`) keeps Blob throughput within Pro tier limits
- Response JSON now includes `icons_uploaded` and `icons_fallback` counts for observability

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/lib/icons.ts** - `405e0a4` (feat)
2. **Task 2: Wire icon pipeline into cron route** - `7ddde6e` (feat)

## Files Created/Modified

- `src/lib/icons.ts` — DuckDuckGo favicon fetch + Vercel Blob upload service; exports `fetchAndStoreIcon`
- `src/app/api/cron/sync/route.ts` — Added icon pipeline after soft-delete step with incremental guard, concurrency cap, and response count fields

## Decisions Made

- HTTP status check (`res.status !== 200`) is the only reliable DuckDuckGo 404 signal — the service returns a real PNG body on both 200 (found) and 404 (not found), so body size or content-type checks would silently pass all 404s as uploads
- Icon pipeline placed after soft-delete and before `revalidateTag` — this ordering means ISR invalidation happens only after icon URLs are committed to the DB
- Concurrency cap of 10 chosen per RESEARCH.md Assumption A4: Vercel Blob Pro tier supports 75 ops/sec; 10 concurrent requests with typical favicon fetch latency stays well within this limit

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `icon_url` is populated from Vercel Blob for casks with a reachable favicon, or `icon_is_fallback = true` for those without. The CSS initials fallback rendering is Phase 2 work and is correctly deferred.

## Threat Surface Scan

No new security-relevant surface beyond the plan's threat model:

- T-03-01 (SSRF): `safeFetch` used for all favicon HTTP calls — DuckDuckGo redirect chains validated against `BLOCKED_CIDR_PREFIXES` in `fetch-allowlist.ts`
- T-03-03 (DoS): Concurrency cap of 10 implemented as specified
- T-03-04 (token leakage): `BLOB_READ_WRITE_TOKEN` never referenced in application code — `@vercel/blob` SDK reads it from `process.env` internally; catch blocks log `String(err)` only

## Self-Check: PASSED

Files created/exist:
- `src/lib/icons.ts` — FOUND
- `src/app/api/cron/sync/route.ts` — FOUND (modified)

Commits:
- `405e0a4` — FOUND (Task 1: icons.ts)
- `7ddde6e` — FOUND (Task 2: cron route update)

TypeScript: 0 errors (`npx tsc --noEmit`)
Grep checks: `res.status !== 200` in icons.ts — CONFIRMED; `isNull(casks.icon_url)` in route.ts — CONFIRMED
