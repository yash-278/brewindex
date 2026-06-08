---
phase: 04-discovery-layer
verified: 2026-05-27T12:00:00Z
status: gaps_found
score: 9/10 must-haves verified
overrides_applied: 0
gaps:
  - truth: "Filter and sort state persist in URL for back-button and sharing — and sort persists across pagination"
    status: failed
    reason: "Pagination component generates bare ?page=N links that replace the full query string. Navigating to page 2 while ?category=Developer+Tools&sort=alphabetical is active drops both params — the user lands on /browse?page=2 with no category or sort, resetting the browse state."
    artifacts:
      - path: "src/components/pagination.tsx"
        issue: "href values are literal ?page=N strings (lines 81, 102, 114). Next.js Link with a relative href beginning with '?' replaces only the query string with that single param, discarding all other existing params."
    missing:
      - "Update Pagination to accept the current search-params context (or build hrefs from URLSearchParams that preserve category, sort, and q params alongside the page number). The component must be made aware of the existing query params — either passed from the browse page as a prop, or converted to a client island that reads useSearchParams()."
---

# Phase 4: Discovery Layer — Verification Report

**Phase Goal:** Users can explore the catalog by category and sort order, and casks with GitHub repos show social proof metrics on their detail pages
**Verified:** 2026-05-27T12:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Database schema has category column for storing categorization data | VERIFIED | `src/db/schema.ts` line 25: `category: text('category'),` between install_365d and github_stars; migration file `0002_add_category.sql` exists with ALTER TABLE and CREATE INDEX statements |
| 2 | Query layer can filter casks by category and apply dynamic sort order | VERIFIED | `getCasksPageFiltered` in `src/lib/queries.ts` lines 92–119: conditions array pattern, dynamic orderClause ternary, all wrapped in unstable_cache with tags: ['casks'] |
| 3 | Browse page can receive category and sort params from URL and fetch filtered results | VERIFIED | `src/app/browse/page.tsx` line 15: searchParams type includes `category?: string; sort?: string`; line 38: sort validated against whitelist; lines 40–44: Promise.all with filtered query calls |
| 4 | User can click a category pill to filter the browse grid to that category | VERIFIED | `src/components/category-filter.tsx`: 'use client', setCategory() calls params.set('category', cat) + router.replace; pill bar rendered above CaskGrid in browse page |
| 5 | User can change the sort order and see results re-ordered immediately | VERIFIED | `src/components/sort-dropdown.tsx`: 'use client', handleChange() calls params.set('sort') + router.replace; SortDropdown rendered above CaskGrid in browse page |
| 6 | Filter and sort state persist in URL for back-button and sharing — and sort persists across pagination | FAILED | `src/components/pagination.tsx` generates bare `?page=N` href links (lines 81, 102, 114). These are query-string-replacement hrefs — clicking Next page while `?category=Utilities&sort=alphabetical` is active navigates to `?page=2` with no category or sort, breaking filter/sort state across pages. ROADMAP SC #2 ("sort persists across pagination") is directly violated. |
| 7 | Responsive grid adapts from 1 to 4 columns based on viewport width | VERIFIED | `src/components/cask-grid.tsx` line 31: `className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"` |
| 8 | Cask detail pages with GitHub repos show star/fork/issue counts | VERIFIED | `src/components/github-stats-card.tsx` renders three stats (stars/forks/issues) with lucide icons; `src/app/cask/[token]/page.tsx` line 222: `<GitHubStatsCard cask={c} />` placed after install section |
| 9 | Browse cards show star count badge when GitHub data available | VERIFIED | `src/components/cask-card.tsx` lines 114–116: conditional `{cask.github_enriched && cask.github_stars !== null && <StarBadge count={cask.github_stars} />}` in metadata strip |
| 10 | GitHub stats only render when github_enriched is true | VERIFIED | `src/components/github-stats-card.tsx` line 7: early `if (!cask.github_enriched || cask.github_stars === null) return null;` — double guard per D-12 |

**Score:** 9/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | category column definition | VERIFIED | Line 25: `category: text('category'),` present |
| `src/db/migrations/0002_add_category.sql` | Migration with ALTER TABLE + CREATE INDEX | VERIFIED | 9 lines; contains both required SQL statements; applied to Railway Postgres via psql |
| `src/lib/queries.ts` | getCasksPageFiltered, getCasksCountFiltered, getCategories | VERIFIED | All three functions exported; 150 lines total |
| `src/components/category-filter.tsx` | Client island for category filter pills | VERIFIED | 76 lines; 'use client'; useSearchParams + router.replace; role="group" aria-label |
| `src/components/sort-dropdown.tsx` | Client island for sort dropdown | VERIFIED | 49 lines; 'use client'; SORT_OPTIONS const; handleChange with URL update |
| `src/app/browse/page.tsx` | Browse page with category/sort param handling | VERIFIED | All filtered query calls present; CategoryFilter + SortDropdown rendered |
| `src/components/cask-grid.tsx` | Responsive grid with 1/2/3/4 column breakpoints | VERIFIED | Line 31: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6` |
| `src/components/github-stats-card.tsx` | Server component for detail page GitHub stats | VERIFIED | 133 lines; no 'use client'; CaskSelectRow typed; three stats with lucide icons; REPOSITORY STATS heading |
| `src/components/star-badge.tsx` | Pure component for star count pill | VERIFIED | 20 lines; '★ {formatInstallCount(count)}'; rgba(124,106,255,0.15) background |
| `src/components/cask-card.tsx` | CaskCard with conditional star badge | VERIFIED | Line 114: github_enriched double-guard before StarBadge |
| `src/app/cask/[token]/page.tsx` | Detail page with GitHub stats card | VERIFIED | GitHubStatsCard imported and rendered at line 222 |
| `scripts/categorize-casks.ts` | ML categorization job via AWS Bedrock | VERIFIED | 303 lines; BedrockRuntimeClient; Nova Micro model; parallel batches; revalidateTag; credential check |
| `.env.example` | AWS credentials documentation | VERIFIED | Lines 24–26: AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY documented |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/queries.ts` | `src/db/schema.ts` | category column reference `casks.category` | VERIFIED | Lines 100, 126, 142, 144, 145 all reference `casks.category` |
| `src/components/category-filter.tsx` | `src/app/browse/page.tsx` | URL query param `?category=X` via params.set('category') | VERIFIED | Line 18: `params.set('category', cat)`; browse page reads category from searchParams |
| `src/components/sort-dropdown.tsx` | `src/app/browse/page.tsx` | URL query param `?sort=Y` via params.set('sort') | VERIFIED | Line 17: `params.set('sort', e.target.value)`; browse page reads sort from searchParams |
| `src/app/browse/page.tsx` | `src/lib/queries.ts` | getCasksPageFiltered call | VERIFIED | Line 41: `getCasksPageFiltered({ category, sort: sortKey, page })` |
| `src/components/github-stats-card.tsx` | `src/db/schema.ts` | CaskSelectRow type | VERIFIED | Line 1: `import type { CaskSelectRow } from '@/db/schema'`; uses github_stars, github_forks, github_issues, github_enriched fields |
| `src/components/cask-card.tsx` | `src/components/star-badge.tsx` | conditional render on github_enriched | VERIFIED | Lines 114–116: `{cask.github_enriched && cask.github_stars !== null && (<StarBadge count={cask.github_stars} />)}` |
| `scripts/categorize-casks.ts` | `src/db/schema.ts` | category column update via schema.casks.category | VERIFIED | Line 174: `db.update(schema.casks).set({ category }).where(eq(schema.casks.id, id))`; line 219: `isNull(schema.casks.category)` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/app/browse/page.tsx` | pageCasks, categories | getCasksPageFiltered, getCategories (Drizzle → Postgres) | Yes — queries on casks table with real filters | FLOWING |
| `src/components/github-stats-card.tsx` | cask.github_stars/forks/issues | cask prop from getCaskByToken (Drizzle → Postgres) | Yes — DB query in detail page | FLOWING |
| `src/components/cask-card.tsx` | cask.github_enriched, cask.github_stars | cask prop from getCasksPageFiltered | Yes — comes from DB query | FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for server-rendered Next.js pages — cannot invoke without a running Next.js dev/prod server. TypeScript compilation verified clean (`npx tsc --noEmit` exits 0 with no output).

### Probe Execution

No probes declared in PLAN.md files or found under `scripts/*/tests/probe-*.sh`. Step 7c: N/A.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| BRWS-02 | 04-01, 04-02, 04-04 | User can filter casks by category | PARTIALLY SATISFIED | Category filter UI, query layer, and ML categorization script all exist and are wired. Gap: pagination breaks filter state (see gaps). Category filtering itself works for single-page results. |
| BRWS-03 | 04-01, 04-02 | User can sort the browse grid | PARTIALLY SATISFIED | Sort dropdown, sort query logic, and sort validation all implemented. Gap: same pagination issue drops sort on page change. |
| DETL-05 | 04-03 | User can see GitHub stars, forks, and open issues | SATISFIED | GitHubStatsCard on detail page, StarBadge on browse cards, both guarded by github_enriched. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `scripts/categorize-casks.ts` | 289 | `revalidateTag("casks", "max")` — called with 2 arguments | Info | next/cache `revalidateTag` accepts only 1 argument; second arg is silently ignored at runtime. TypeScript compiles clean with no error (zero output from `npx tsc --noEmit`), suggesting the Next.js type definitions may accept an options overload, or the `@types/next` version in use accepts this call. Not a blocker — runtime behavior is correct since "casks" tag invalidation succeeds. |

No unreferenced TBD/FIXME/XXX markers found in any phase-modified files.

Note: `placeholder="blur"` at `src/app/cask/[token]/page.tsx` line 119 is a Next.js `Image` prop value — not a debt marker.

### Human Verification Required

#### 1. Category Filter with Pagination — State Loss

**Test:** In the browse page, select a category (e.g., "Developer Tools"), then navigate to page 2 via the Pagination component.
**Expected (ROADMAP SC #2):** The URL should be `/browse?category=Developer+Tools&sort=popular&page=2` and the grid should still show filtered results.
**Actual (codebase evidence):** Pagination links are `?page=2` with no other params. The URL becomes `/browse?page=2` and the category filter is lost.
**Why human:** Confirms the exact UX degradation in a live browser.

#### 2. ML Categorization Run Outcome — Browse Filter Population

**Test:** Visit the live browse page. Click the CategoryFilter to see if category pills are populated with real categories (Developer Tools, Productivity, etc.) or show only "All Apps".
**Expected:** At least 8–10 category pills shown based on ML categorization run (human-verify checkpoint was approved per 04-04-SUMMARY.md).
**Why human:** Database state after the Bedrock run is not verifiable from code alone.

### Gaps Summary

**1 gap blocks full goal achievement.**

The Pagination component (`src/components/pagination.tsx`) generates bare `?page=N` href strings for all navigation links (Prev, page numbers, Next). In Next.js App Router, a `Link href="?page=2"` replaces the entire query string with `?page=2`, discarding any existing `?category=X` or `?sort=Y` params. This means:

- A user filtered to "Developer Tools" navigates to page 2 → filter is lost
- A user sorted by "A-Z" navigates to page 2 → sort resets to default "popular"

This directly violates ROADMAP Phase 4 Success Criterion #2 ("sort persists across pagination") and Plan 04-02 must-have truth ("Filter and sort state persist in URL for back-button and sharing").

The Pagination component was built in Phase 2 before filtering existed. The Phase 4 plans did not task anyone with updating it to be filter-aware. The fix requires passing the current query params (category, sort, q) into Pagination and building hrefs that include them — e.g., `?category=Developer+Tools&sort=alphabetical&page=2`.

**Root cause:** Pre-existing Pagination component from Phase 2 was not updated when category/sort filters were added in Phase 4.

---

_Verified: 2026-05-27T12:00:00Z_
_Verifier: Claude (gsd-verifier)_
