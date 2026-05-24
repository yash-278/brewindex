---
plan: 01-02
phase: 01-data-pipeline
status: complete
completed: 2026-05-24
duration: ~15 minutes
tasks_completed: 2
tasks_total: 2
commits:
  - af3589a
  - 9c6c2c4
requirements_addressed:
  - DATA-01
key_decisions:
  - "Analytics fetched from 3 separate endpoints (not bulk cask.json) and merged in-memory"
  - "500-row batch upsert used instead of per-row inserts (~5s vs ~383s for 7,659 casks)"
  - "Soft-delete via notInArray for casks absent from API response (D-08)"
  - "scripts/seed.ts for local initial populate — daily cron handles incremental updates"
dependencies:
  requires:
    - "01-01 (schema, db connection, fetch-allowlist)"
  provides:
    - "src/lib/homebrew.ts — fetchHomebrewCatalog, fetchHomebrewAnalytics, mapHomebrewCask, parseAnalyticsCount"
    - "Full cron route with 7,659-cask upsert, soft-delete, ISR invalidation"
    - "scripts/seed.ts for local initial populate"
  affects:
    - "Plans 03 and 04 extend cask rows with icon_url and github_* fields"
tech_stack:
  added:
    - "zod/v4 for HomebrewCaskSchema, AnalyticsEntrySchema, AnalyticsResponseSchema validation"
    - "drizzle-orm notInArray for soft-delete pattern"
    - "dotenv/config in seed script for .env.local loading"
  patterns:
    - "Parallel Promise.all for catalog + analytics fetch"
    - "500-row batch upsert with onConflictDoUpdate sql`excluded.*` references"
    - "Map<token, counts> for O(1) analytics lookup during mapHomebrewCask"
key_files:
  created:
    - src/lib/homebrew.ts
    - scripts/seed.ts
  modified:
    - src/app/api/cron/sync/route.ts
    - package.json
---

# Phase 01 Plan 02: Homebrew API Client + Full Cask Sync Summary

Homebrew API client with Zod validation and analytics merge, wired into 500-row batch cron upsert for all ~7,659 casks, with local seed script for initial populate.

## What Was Built

### Task 1: src/lib/homebrew.ts

Homebrew service library with four exports:

- `parseAnalyticsCount(raw: string): number` — strips commas before parseInt so "204,909" becomes 204909 (not 204). This is the critical comma-corruption guard from RESEARCH.md Pitfall 2.
- `mapHomebrewCask(cask, analytics): CaskInsertRow` — maps validated API response to DB row. Uses `cask.name[0]` (Pitfall 8: name is string[]). Does NOT set icon_url, icon_is_fallback, or github_* fields (those belong to Plans 03 and 04).
- `fetchHomebrewCatalog()` — fetches bulk cask.json via safeFetch, validates with z.array(HomebrewCaskSchema).parse().
- `fetchHomebrewAnalytics()` — fetches 30d, 90d, 365d analytics in parallel via Promise.all (Pitfall 1: analytics not in bulk endpoint), builds Map<token, counts> for O(1) lookup.

### Task 2: Full sync + seed script

- `src/app/api/cron/sync/route.ts` — replaces one-cask skeleton with full sync. Fetches catalog and analytics in parallel. Upserts all rows in 500-row batches with `onConflictDoUpdate` for all cask fields. Soft-deletes absent tokens via `notInArray` (D-08). Calls `revalidateTag('casks', 'max')` after success. Returns `{ ok: true, synced: N }`.
- `scripts/seed.ts` — standalone local populate script. Loads `DATABASE_URL` from `.env.local` via `import 'dotenv/config'`. Runs identical batch upsert + soft-delete logic. Prints per-batch progress (`Batch N/M (K rows)... done`) and final count.
- `package.json` — added `"seed": "npx tsx scripts/seed.ts"` script entry.

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `parseAnalyticsCount('204,909')` | 204909 (not 204) |
| `parseAnalyticsCount('1,234')` | 1234 |
| `grep BATCH_SIZE route.ts` | `const BATCH_SIZE = 500` |
| `grep notInArray route.ts` | present (soft-delete) |
| `grep revalidateTag route.ts` | `revalidateTag('casks', 'max')` (two args) |
| CRON_SECRET guard position | First executable statement in handler (line 14) |
| `fetchHomebrewAnalytics` uses safeFetch | Confirmed (not raw fetch) |
| `mapHomebrewCask` uses `name[0]` | Confirmed |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All fields that Plans 03/04 will populate (icon_url, icon_is_fallback, github_*) are intentionally left as DB column defaults in this plan — they are wired by the next plans and not part of this plan's scope.

## Threat Surface Scan

No new security-relevant surface beyond what the plan's threat model covers:

- T-02-01: Zod HomebrewCaskSchema.parse() and AnalyticsResponseSchema.parse() applied to all external data before any DB write. ZodError thrown on malformed payload.
- T-02-03: All DB writes use Drizzle parameterized inserts + `sql\`excluded.*\`` column references (no string interpolation of values).
- T-02-SC: All packages (zod, drizzle-orm) were verified in Plan 01's legitimacy audit.

## Self-Check: PASSED
