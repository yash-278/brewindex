---
phase: 04-discovery-layer
plan: 02
subsystem: ui
tags: [nextjs, react, url-state, useSearchParams, filter, sort, tailwind, responsive-grid]

# Dependency graph
requires:
  - phase: 04-discovery-layer
    plan: 01
    provides: getCasksPageFiltered, getCasksCountFiltered, getCategories query functions
  - phase: 03-search-security
    provides: useSearchParams URL state pattern from search-input.tsx
provides:
  - CategoryFilter client island (pill bar with URL state management)
  - SortDropdown client island (native select with URL state management)
  - Browse page extended with category/sort URL params
  - Responsive 4-breakpoint cask grid (1/2/3/4 columns)
affects: [05-deployment, browse-page-ux, cask-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - URL state management via useSearchParams + router.replace (no debounce for filter/sort)
    - Sort param whitelist validation at page level ('popular' | 'alphabetical' | 'updated')
    - Client island pattern: 'use client' components receive server-fetched data as props
    - 4-breakpoint responsive grid: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4

key-files:
  created:
    - src/components/category-filter.tsx
    - src/components/sort-dropdown.tsx
  modified:
    - src/app/browse/page.tsx
    - src/components/cask-grid.tsx

key-decisions:
  - "CategoryFilter and SortDropdown receive server-fetched data as props — client islands avoid prop drilling by reading URL state themselves via useSearchParams"
  - "Sort param validated at browse page level before passing to getCasksPageFiltered — TypeScript type safety at query layer, URL safety at page layer"
  - "Removed getCasksPage/getCasksCount imports from browse page — fully replaced by filtered variants for all browse paths"
  - "Grid gap increased from gap-3 (12px) to gap-6 (24px) per D-15 for visual breathing room at 4-column layout"

patterns-established:
  - "Client island URL update: const params = new URLSearchParams(searchParams.toString()); params.set/delete; router.replace(pathname + '?' + params, { scroll: false })"
  - "Always delete 'page' param when filter/sort changes to reset pagination"
  - "Sort whitelist: (sort === 'alphabetical' || sort === 'updated') ? sort : 'popular'"

requirements-completed: [BRWS-02, BRWS-03]

# Metrics
duration: 3min
completed: 2026-05-26
---

# Phase 04 Plan 02: Discovery Layer — Category Filter, Sort Controls, Responsive Grid Summary

**CategoryFilter pill bar and SortDropdown client islands wired to browse page via URL state, with responsive 4-breakpoint grid (1/2/3/4 columns) replacing the previous 2-column layout**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-26T08:36:11Z
- **Completed:** 2026-05-26T08:38:59Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- `CategoryFilter`: pill bar with "All Apps" + dynamic category pills, URL state via `useSearchParams + router.replace`, ARIA role=group + aria-pressed
- `SortDropdown`: native `<select>` with popular/A-Z/recently-updated options, same URL state pattern
- Both components reset `?page` param on change and use `{ scroll: false }` for smooth navigation
- Browse page searchParams type extended to include `category` and `sort`; sort validated against whitelist with 'popular' fallback
- Browse page now calls `getCasksPageFiltered`, `getCasksCountFiltered`, `getCategories` (replacing simple `getCasksPage`/`getCasksCount`)
- `CaskGrid` updated from 2-column to 4-breakpoint responsive layout: 1 col (mobile) → 2 (≥640px) → 3 (≥1024px) → 4 (≥1440px), gap-6

## Task Commits

Each task was committed atomically:

1. **Task 1: Create CategoryFilter and SortDropdown client islands** - `7b740cd` (feat)
2. **Task 2: Wire filters into browse page and update grid layout** - `f6b7934` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified
- `src/components/category-filter.tsx` — Client island: pill bar with URL-driven category filter, ARIA accessibility
- `src/components/sort-dropdown.tsx` — Client island: native select for sort order with URL state management
- `src/app/browse/page.tsx` — Extended searchParams type, sort validation, filtered queries, filter/sort controls above grid
- `src/components/cask-grid.tsx` — 4-breakpoint responsive grid replacing 2-column layout

## Decisions Made
- **Client islands receive props from server** — CategoryFilter takes `categories` prop (server-fetched) and `currentCategory` (from URL param passed as prop). This avoids re-fetching inside the client component while keeping URL state reactive.
- **Sort validation at page level** — `const sortKey = (sort === 'alphabetical' || sort === 'updated') ? sort : 'popular'` ensures only valid sort values reach the query layer (defense-in-depth alongside TypeScript union type in queries.ts).
- **Removed old query imports** — `getCasksPage` and `getCasksCount` removed from browse page imports since all browse paths now use the filtered variants (even with no active filter, `getCasksPageFiltered` with undefined category behaves identically).
- **Pre-existing TypeScript error in scripts/categorize-casks.ts** — `revalidateTag('casks', 'max')` call on line 224 generates TS2554 (expected 1 arg, got 2); this file was committed in a prior plan (04-03) and is not modified by this plan. Documented as out-of-scope per deviation rule scope boundary.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in `scripts/categorize-casks.ts` (line 224: `revalidateTag` called with 2 args). This script was introduced by a concurrent wave (04-03) and is not part of this plan's scope. Our changes (browse page, category-filter, sort-dropdown, cask-grid) are all TypeScript-clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Full App Store-like browse experience complete: filter by category, sort by popularity/alphabetical/recently-updated, URL-persistent state for back-button and sharing
- CategoryFilter will show only "All Apps" until categorization pipeline runs (casks currently have NULL category); this is expected and handled gracefully
- Ready for Phase 05 (deployment) or 04-03 verification
- No blockers

---
*Phase: 04-discovery-layer*
*Completed: 2026-05-26*

## Self-Check

**Checking files exist:**
- src/components/category-filter.tsx — ✓ created (75 lines)
- src/components/sort-dropdown.tsx — ✓ created (50 lines)
- src/app/browse/page.tsx — ✓ modified
- src/components/cask-grid.tsx — ✓ modified

**Checking commits exist:**
- 7b740cd — feat(04-02): create CategoryFilter and SortDropdown client islands
- f6b7934 — feat(04-02): wire category/sort filters into browse page and update grid layout

**Checking acceptance criteria:**
- category-filter.tsx 'use client': PASS (1 match)
- sort-dropdown.tsx 'use client': PASS (1 match)
- useSearchParams in category-filter.tsx: PASS
- router.replace in both components: PASS
- SORT_OPTIONS const in sort-dropdown.tsx: PASS
- handleChange in sort-dropdown.tsx: PASS
- searchParams type includes category+sort: PASS
- getCasksPageFiltered in browse page: PASS
- getCasksCountFiltered in browse page: PASS
- getCategories in browse page: PASS
- CategoryFilter rendered in browse page: PASS
- SortDropdown rendered in browse page: PASS
- lg:grid-cols-3 xl:grid-cols-4 in cask-grid.tsx: PASS
- Build succeeds (Next.js): PASS — /browse remains ƒ (Dynamic)

## Self-Check: PASSED
