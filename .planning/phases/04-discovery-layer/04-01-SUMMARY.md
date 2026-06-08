---
phase: 04-discovery-layer
plan: 01
subsystem: database
tags: [drizzle, postgres, category, filtering, sorting, queries, unstable_cache, isr]

# Dependency graph
requires:
  - phase: 03-search-security
    provides: tsvector search foundation, queries.ts patterns, migration file format
  - phase: 01-data-pipeline
    provides: casks table schema, github_stars/forks/issues columns, is_active flag
provides:
  - category column (nullable text) in casks table
  - idx_casks_category index for filtering performance
  - getCasksPageFiltered function with optional category filter and dynamic sort
  - getCasksCountFiltered function for paginated counts with optional category filter
  - getCategories function returning distinct non-null categories for filter UI
affects: [04-02-browse-page-ui, 04-03-github-stats, 05-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Conditional WHERE array building (avoid Drizzle eq(col, undefined) pitfall)
    - Dynamic ORDER BY via ternary (sort === 'alphabetical' ? asc : desc)
    - unstable_cache with tags: ['casks'] for all new query functions

key-files:
  created:
    - src/db/migrations/0002_add_category.sql
  modified:
    - src/db/schema.ts
    - src/lib/queries.ts

key-decisions:
  - "Applied migration directly via psql (drizzle-kit push fails on pg_stat_statements extension in Railway Postgres)"
  - "category column is nullable text — matches D-03 (populated during pipeline enrichment, NULL for uncategorized)"
  - "Sort validation enforced at TypeScript type level in getCasksPageFiltered signature ('popular' | 'alphabetical' | 'updated')"
  - "Conditions array pattern prevents Drizzle eq(col, undefined) from generating WHERE category = NULL"

patterns-established:
  - "Conditional conditions array: const conditions = [eq(casks.is_active, true)]; if (filter) conditions.push(eq(...))"
  - "Dynamic orderClause: ternary selecting asc/desc based on sort param"
  - "unstable_cache wrapping all browse queries with tags: ['casks'] for revalidateTag invalidation"

requirements-completed: [BRWS-02, BRWS-03]

# Metrics
duration: 3min
completed: 2026-05-26
---

# Phase 04 Plan 01: Discovery Layer — DB & Query Foundation Summary

**Nullable `category` column added to casks table with filtering index, plus three ISR-cached Drizzle query functions for category-filtered browsing with dynamic sort order**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-26T08:30:04Z
- **Completed:** 2026-05-26T08:32:55Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- `category` text column (nullable) added to `casks` table in Drizzle schema + applied directly to Railway Postgres via psql
- `idx_casks_category` B-tree index created for filtering performance
- `getCasksPageFiltered`: optional category filter + dynamic sort (popular/alphabetical/updated) + pagination, cached with `tags: ['casks']`
- `getCasksCountFiltered`: count with optional category filter for accurate paginated counts, cached with `tags: ['casks']`
- `getCategories`: distinct non-null categories ordered alphabetically for filter UI population, cached with `tags: ['casks']`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add category column to schema and create migration** - `0498a53` (feat)
2. **Task 2: Add query functions for filtered browsing** - `67fc11a` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified
- `src/db/schema.ts` — Added `category: text('category')` column between install_365d and github_stars
- `src/db/migrations/0002_add_category.sql` — Migration with ALTER TABLE and CREATE INDEX; applied to Railway Postgres via psql
- `src/lib/queries.ts` — Added `asc` to drizzle-orm imports; added getCasksPageFiltered, getCasksCountFiltered, getCategories

## Decisions Made
- **Applied migration via psql directly** — `drizzle-kit push` failed with a `pg_stat_statements` extension error (Railway Postgres has this system extension; drizzle-kit tries to drop/recreate it). SQL was applied directly via `psql` and verified. Migration file still exists as documentation.
- **category column nullable by default** — Matches decision D-03; category is populated during pipeline enrichment (Bedrock ML), so initial rows are NULL.
- **Sort whitelist at TypeScript level** — `getCasksPageFiltered` signature uses `'popular' | 'alphabetical' | 'updated'` union type. Browse page (04-02) will validate URL params before calling this function.
- **Conditions array pattern** — Uses `const conditions: ReturnType<typeof eq>[] = [eq(casks.is_active, true)]` then conditionally pushes `eq(casks.category, category)` to avoid Drizzle's `eq(col, undefined) → WHERE col = NULL` pitfall (documented in 04-RESEARCH.md Pitfall 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] drizzle-kit push failed with pg_stat_statements extension error**
- **Found during:** Task 1 (Apply schema migration)
- **Issue:** `npx drizzle-kit push` failed with: `error: cannot drop view pg_stat_statements_info because extension pg_stat_statements requires it`. Railway Postgres includes this system extension; drizzle-kit tries to drop and recreate extensions during schema push.
- **Fix:** Applied migration SQL directly via `psql` command targeting the DATABASE_URL. Verified column and index creation with `information_schema.columns` and `pg_indexes` queries.
- **Files modified:** None (DB change, not file change)
- **Verification:** `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'casks' AND column_name = 'category'` returned `category | text | YES`. Index verified via `pg_indexes`.
- **Committed in:** `0498a53` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Migration applied successfully via direct psql — functionally equivalent to drizzle-kit push. No scope creep. Migration file exists as documentation artifact.

## Issues Encountered
- `drizzle-kit push` incompatible with Railway Postgres `pg_stat_statements` extension. Workaround: apply DDL directly via psql. This is a known drizzle-kit limitation with Postgres instances that have read-only system extensions.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Data layer complete for category filtering and dynamic sorting — ready for 04-02 (browse page UI with filter/sort controls)
- `getCategories` will return empty array until categorization pipeline runs (all casks have `category = NULL` initially); browse UI should handle this gracefully
- No blockers

---
*Phase: 04-discovery-layer*
*Completed: 2026-05-26*

## Self-Check

**Checking files exist:**
- src/db/schema.ts — exists (modified)
- src/db/migrations/0002_add_category.sql — exists (created)
- src/lib/queries.ts — exists (modified)

**Checking commits exist:**
- 0498a53 — feat(04-01): add category column to schema and create migration
- 67fc11a — feat(04-01): add getCasksPageFiltered, getCasksCountFiltered, getCategories query functions

## Self-Check: PASSED
