---
phase: 03-search-security
plan: 01
subsystem: database
tags: [search, tsvector, gin-index, postgres, drizzle, schema-migration]
dependency_graph:
  requires: [02-browse-ui]
  provides: [tsvector-search-foundation, searchCasks-query-function]
  affects: [src/db/schema.ts, src/lib/queries.ts, neon-postgres]
tech_stack:
  added: []
  patterns:
    - Drizzle customType for tsvector generated column
    - pgTable three-argument form with table-level GIN index
    - Plain async function (not unstable_cache) for search queries
    - plainto_tsquery with ts_rank ordering
key_files:
  created:
    - src/db/migrations/0001_add_search_vector.sql
    - src/db/migrations/meta/_journal.json
    - src/db/migrations/meta/0000_snapshot.json
  modified:
    - src/db/schema.ts
    - src/lib/queries.ts
decisions:
  - Manual ALTER TABLE applied via psql after drizzle-kit generate produced incorrect CREATE TABLE (casks table was created outside migration history in Phase 01)
  - Migration file 0001_add_search_vector.sql documents the ALTER TABLE and CREATE INDEX applied
  - Drizzle-kit baseline snapshot committed so future migrations can diff correctly
metrics:
  duration_mins: 4
  completed_date: "2026-05-25"
  tasks_completed: 3
  tasks_total: 3
  files_created: 3
  files_modified: 2
---

# Phase 03 Plan 01: tsvector Search Foundation Summary

**One-liner:** Postgres tsvector GENERATED ALWAYS AS column with GIN index on casks table, plus searchCasks(q) query function using plainto_tsquery + ts_rank ordering.

## What Was Built

This plan delivers the complete database and query layer for full-text search (SRCH-01):

1. **schema.ts** — added `search_vector tsvector` generated column using `customType` + `generatedAlwaysAs()`. The column auto-populates from `to_tsvector('english', name || description)` and is excluded from `$inferInsert` automatically.

2. **Migration applied to live Neon** — `search_vector` column and `idx_casks_search_vector` GIN index applied to the live database. All 7,664 existing rows were populated synchronously by Postgres on ALTER TABLE.

3. **queries.ts** — added `SEARCH_RESULT_CAP = 50` constant and `searchCasks(q: string): Promise<CaskSelectRow[]>` using `plainto_tsquery` with `ts_rank` primary ordering and `install_365d` secondary sort. NOT wrapped in `unstable_cache` — search results must be fresh per query.

## Verification Evidence

- TypeScript compiles cleanly: `npx tsc --noEmit` exits with code 0
- Live database column confirmed: `SELECT column_name FROM information_schema.columns WHERE table_name = 'casks' AND column_name = 'search_vector'` — returns 1 row
- Live index confirmed: `SELECT indexname FROM pg_indexes WHERE tablename = 'casks' AND indexname = 'idx_casks_search_vector'` — returns 1 row
- Search test confirmed: `SELECT token, ts_rank(...) FROM casks WHERE search_vector @@ plainto_tsquery('english', 'code editor')` — returns visual-studio-code and related casks ranked by relevance

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1 | 7b18eb7 | feat(03-01): add tsvector generated column and GIN index to casks schema |
| Task 2 | fab7a64 | feat(03-01): add search_vector migration SQL and drizzle schema baseline |
| Task 3 | 5b03382 | feat(03-01): add searchCasks function and SEARCH_RESULT_CAP to queries.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit generate produced CREATE TABLE instead of ALTER TABLE**

- **Found during:** Task 2
- **Issue:** The casks table was created in Phase 01 (data-pipeline) without establishing a drizzle-kit migration history. `drizzle-kit generate` generated a CREATE TABLE migration; `drizzle-kit migrate` failed with exit code 1 because the table already exists.
- **Fix:** Applied the ALTER TABLE and CREATE INDEX directly via psql. Replaced the incorrect CREATE TABLE migration with a correct `0001_add_search_vector.sql` containing only the ALTER TABLE and CREATE INDEX statements. Committed the drizzle-kit snapshot as a baseline so future migrations can diff correctly.
- **Files modified:** `src/db/migrations/0001_add_search_vector.sql` (replaced), `src/db/migrations/meta/_journal.json` (updated), `src/db/migrations/meta/0000_snapshot.json` (retained)
- **Impact:** No functional change — the column and index are correctly live in Neon. The migration file accurately documents what was applied.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries beyond what was planned. The `search_vector` column is a Postgres-managed generated column (not writable by application). All planned threat mitigations applied:

| Threat ID | Status |
|-----------|--------|
| T-03-01 — tsquery injection | Mitigated: `${q}` passed as Drizzle sql tag parameter; `plainto_tsquery` parses natural language tokens |
| T-03-02 — generated column tampering | Accepted: Drizzle `$inferInsert` excludes `search_vector`; Postgres rejects direct writes |
| T-03-SC — npm package legitimacy | Accepted: no new packages installed |

## Known Stubs

None — all functionality is fully wired. The `searchCasks` function queries live Neon Postgres data.

## Self-Check: PASSED

- [x] `src/db/schema.ts` exists and contains `generatedAlwaysAs`, `idx_casks_search_vector`, `.using('gin'`
- [x] `src/db/migrations/0001_add_search_vector.sql` exists and contains `search_vector`, `GENERATED ALWAYS AS`, `CREATE INDEX`, `idx_casks_search_vector`
- [x] `src/lib/queries.ts` exports `SEARCH_RESULT_CAP` and `searchCasks`
- [x] Commits 7b18eb7, fab7a64, 5b03382 exist in git log
- [x] TypeScript compiles cleanly
- [x] Live database has column and index confirmed via psql
