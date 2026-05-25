---
phase: 03-search-security
verified: 2026-05-25T15:28:37Z
status: human_needed
score: 9/9 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Type a cask name (e.g. 'visual studio') into the header search input on /browse"
    expected: "After ~300ms, the URL changes to /browse?q=visual+studio and cask results appear with a result count; the Pagination component is absent"
    why_human: "Requires live browser interaction, debounce timing, and DB query over real data — not verifiable by static analysis"
  - test: "Click browser back button after performing a search"
    expected: "Back navigation exits /browse entirely (not to intermediate query states), because router.replace was used"
    why_human: "Browser history stack behavior cannot be verified by static analysis"
  - test: "Navigate to /browse in a browser; throttle the network (Chrome DevTools > Slow 3G)"
    expected: "A grid of 12 animate-pulse skeleton cards appears instantly while the server component renders; no layout shift when real content arrives"
    why_human: "Visual layout shift and timing of skeleton display require a live browser observation"
  - test: "Navigate to any /cask/[token] URL (e.g. /cask/visual-studio-code) in a browser with throttled network"
    expected: "A skeleton showing back-nav, 80x80 icon, h1 block, install code block, and three stat tiles appears before real content; no layout shift on content arrival"
    why_human: "Visual skeleton accuracy and no-layout-shift guarantee require live browser comparison"
  - test: "Clear the search input after typing a query"
    expected: "When the input is emptied (or falls below 2 chars), the URL returns to /browse (no ?q param) and the normal paginated grid with Pagination reappears"
    why_human: "Requires live browser interaction to verify the delete-q-param path and paginated grid restoration"
---

# Phase 03: Search + Security Verification Report

**Phase Goal:** Users can find specific casks by name, with fast Postgres full-text search, and page transitions are smooth with skeleton loading states
**Verified:** 2026-05-25T15:28:37Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | The casks table has a search_vector tsvector GENERATED ALWAYS AS STORED column | VERIFIED | `schema.ts` line 31-33: `tsVector('search_vector').generatedAlwaysAs(() => sql\`to_tsvector('english', coalesce(${casks.name}, '') || ' ' || coalesce(${casks.description}, ''))\`)` |
| 2 | A GIN index named idx_casks_search_vector exists on the search_vector column | VERIFIED | `schema.ts` line 36: `index('idx_casks_search_vector').using('gin', t.search_vector)` |
| 3 | queries.ts exports searchCasks(q: string) using plainto_tsquery and SEARCH_RESULT_CAP = 50 | VERIFIED | `queries.ts` lines 67 and 72-87: both exports confirmed, plainto_tsquery with ts_rank ordering, limit(SEARCH_RESULT_CAP), not wrapped in unstable_cache |
| 4 | GET /api/search?q=vscode returns JSON {results:[...]} with Zod validation; ?q=a returns {results:[]} without DB hit | VERIFIED | `src/app/api/search/route.ts`: QuerySchema z.string().min(2).max(100); safeParse guard; try/catch wrapping searchCasks call |
| 5 | Typing into the header search input updates URL to /browse?q=<term> after 300ms debounce using router.replace | VERIFIED | `search-input.tsx`: DEBOUNCE_MS=300, MIN_QUERY_LENGTH=2, router.replace on line 34 (not router.push), params.delete('page') on debounce |
| 6 | SearchInput is wrapped in Suspense in header.tsx; header remains a Server Component | VERIFIED | `header.tsx` lines 47-69: Suspense with disabled-input fallback wraps SearchInput; no 'use client' directive in file |
| 7 | The browse page reads ?q from searchParams and renders search results with result count; Pagination absent in search mode | VERIFIED | `browse/page.tsx` lines 17-28: search branch on `q && q.trim().length >= 2`, renders result count paragraph + CaskGrid, no Pagination inside branch; Pagination only appears in paginated path (line 44) |
| 8 | src/app/browse/loading.tsx renders 12 animate-pulse skeleton cards matching CaskCard layout | VERIFIED | `browse/loading.tsx`: BrowseLoading default export, no 'use client', 12 cards via Array.from({length:12}), each card has className="animate-pulse", icon 52x52, grid grid-cols-1 md:grid-cols-2 gap-3 |
| 9 | src/app/cask/[token]/loading.tsx renders animate-pulse skeleton matching hero + install + stats layout | VERIFIED | `cask/[token]/loading.tsx`: CaskLoading default export, no 'use client', main className="animate-pulse", icon 80x80, ['30d','90d','365d'] stat tiles |

**Score:** 9/9 truths verified

### Deferred Items

Items not yet met but explicitly deferred with documentation in ROADMAP.md Phase 3 deferred section.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | SRCH-02: User can filter search results by macOS platform compatibility | Not yet scheduled | ROADMAP Phase 3 deferred note: "No platform data in schema; requires Phase 1 backfill. Deferred per planning context." — no later phase claims this requirement |
| 2 | SECU-01: All API routes protected by per-IP rate limiting (Upstash ratelimit) | Phase 4 (informally) | ROADMAP Phase 3 deferred note: "Deferred per D-15. Upstash ratelimit already in package.json; revisit Phase 4." Phase 4 does not list SECU-01 in its Requirements field |
| 3 | SECU-02: Vercel WAF rules configured to block bot patterns | No phase | ROADMAP Phase 3 deferred note: "Requires Enterprise plan. Deferred per planning context." No later phase claims it |

**Note on deferred items:** SRCH-02, SECU-01, SECU-02 are listed in REQUIREMENTS.md traceability as "Phase 3 / Pending" but are explicitly deferred in ROADMAP.md Phase 3 with documented rationale. They do not block Phase 3's two Success Criteria, which are fully satisfied.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | casks table with search_vector generated column and GIN index | VERIFIED | customType tsVector declared, generatedAlwaysAs with tsvector expression, index('idx_casks_search_vector').using('gin') |
| `src/lib/queries.ts` | searchCasks function and SEARCH_RESULT_CAP constant | VERIFIED | SEARCH_RESULT_CAP=50 on line 67; searchCasks async function on lines 72-87 with plainto_tsquery, ts_rank, desc(install_365d), limit(50) |
| `src/db/migrations/0001_add_search_vector.sql` | ALTER TABLE + CREATE INDEX migration | VERIFIED | Contains ALTER TABLE "casks" ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS...STORED; CREATE INDEX "idx_casks_search_vector" USING gin |
| `src/app/api/search/route.ts` | GET /api/search?q=... endpoint | VERIFIED | Exports GET; imports searchCasks and z; QuerySchema z.string().min(2).max(100); safeParse guard; try/catch |
| `src/components/search-input.tsx` | Debounced client island writing ?q to URL | VERIFIED | 'use client' first line; useSearchParams/useRouter/usePathname; DEBOUNCE_MS=300; MIN_QUERY_LENGTH=2; router.replace; flex:1, maxWidth:480px |
| `src/components/header.tsx` | Header with live SearchInput in Suspense | VERIFIED | Imports Suspense from 'react' and SearchInput; disabled-stub fallback; no 'use client' |
| `src/app/browse/page.tsx` | Browse page with search branch and result count | VERIFIED | searchCasks imported; searchParams type includes q?: string; if (q && q.trim().length >= 2) branch; no Pagination in search branch |
| `src/app/browse/loading.tsx` | Browse page skeleton — 12 pulse cards | VERIFIED | BrowseLoading default export; animate-pulse per card; 12 cards; grid-cols-1 md:grid-cols-2 gap-3; icon 52x52 |
| `src/app/cask/[token]/loading.tsx` | Cask detail skeleton — hero, install block, stats row | VERIFIED | CaskLoading default export; main animate-pulse; icon 80x80; ['30d','90d','365d'] stat tiles |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/db/schema.ts` | `src/lib/queries.ts` | CaskSelectRow type used as searchCasks return type | WIRED | `queries.ts` imports `type CaskSelectRow` from `@/db/schema`; searchCasks returns `Promise<CaskSelectRow[]>` |
| `src/db/migrations/0001_add_search_vector.sql` | Neon Postgres | drizzle-kit migrate / psql (manual) | VERIFIED | Migration SQL file confirmed present and correct; SUMMARY documents manual psql application with live DB confirmation |
| `src/components/search-input.tsx` | `src/app/browse/page.tsx` | URL param ?q written by client, read by server component | WIRED | SearchInput writes `router.replace(pathname + '?q=...')` ; browse/page.tsx reads `const { q } = await searchParams` |
| `src/app/browse/page.tsx` | `src/lib/queries.ts` | searchCasks(q.trim()) called when q param present | WIRED | `browse/page.tsx` line 18: `const results = await searchCasks(q.trim())` |
| `src/app/api/search/route.ts` | `src/lib/queries.ts` | searchCasks imported and called with validated q | WIRED | `route.ts` line 2: `import { searchCasks } from '@/lib/queries'`; line 16: `const results = await searchCasks(parsed.data.q)` |
| `src/app/browse/loading.tsx` | `src/app/browse/page.tsx` | Next.js App Router loading.tsx automatic Suspense | WIRED | Both files co-located in same route segment; loading.tsx is the App Router convention — no explicit import needed |
| `src/app/cask/[token]/loading.tsx` | `src/app/cask/[token]/page.tsx` | Next.js App Router loading.tsx automatic Suspense | WIRED | Both files co-located in same dynamic route segment |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `src/app/browse/page.tsx` (search branch) | `results: CaskSelectRow[]` | `searchCasks(q.trim())` → Drizzle → Neon Postgres via `plainto_tsquery` + GIN index | Yes — live DB query with WHERE + ORDER BY ts_rank | FLOWING |
| `src/app/api/search/route.ts` | `results: CaskSelectRow[]` | `searchCasks(parsed.data.q)` → same Drizzle query chain | Yes — same DB query path | FLOWING |
| `src/components/search-input.tsx` | `value: string` (URL state) | `useSearchParams().get('q')` on init + `useEffect` sync | URL-driven state (no data fetch needed) | FLOWING |
| `src/app/browse/loading.tsx` | No dynamic data | Static skeleton Server Component | N/A — static skeletons by design | N/A |
| `src/app/cask/[token]/loading.tsx` | No dynamic data | Static skeleton Server Component | N/A — static skeletons by design | N/A |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles cleanly | `npx tsc --noEmit` | No output (exit 0) | PASS |
| SearchInput uses router.replace not router.push | `grep "router\\.replace\|router\\.push" src/components/search-input.tsx` | Only `router.replace` found on line 34 | PASS |
| search branch excludes Pagination | Inspect lines 17-28 of browse/page.tsx | `<Pagination>` only appears on line 44 in paginated path; search branch returns before reaching it | PASS |
| searchCasks is not wrapped in unstable_cache | Inspect queries.ts lines 66-87 | Plain `export async function` — no unstable_cache wrapper | PASS |
| migration SQL contains correct DDL | Read migration file | ALTER TABLE + GENERATED ALWAYS AS STORED + CREATE INDEX USING gin | PASS |

### Probe Execution

No probes declared in PLAN files and no `scripts/*/tests/probe-*.sh` present. Skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-----------|-------------|--------|----------|
| SRCH-01 | 03-01, 03-02, 03-03 | User can search casks by name and get results from the database (server-side) | SATISFIED | tsvector column + GIN index in schema; searchCasks query function; /api/search route; SearchInput client island; browse page search branch — complete end-to-end vertical slice |
| SRCH-02 | 03-01 (declares but defers) | User can filter search results by macOS platform compatibility | DEFERRED | Explicitly deferred in ROADMAP Phase 3 deferred section: no platform data in schema |
| SECU-01 | 03-02 (declares but defers) | All API routes protected by per-IP rate limiting | DEFERRED | Explicitly deferred per D-15; Upstash package present in package.json; revisit Phase 4 |
| SECU-02 | (declared in ROADMAP, no plan task) | Vercel WAF rules configured | DEFERRED | Explicitly deferred in ROADMAP Phase 3 deferred section: requires Enterprise plan |

**Orphaned requirement check:** REQUIREMENTS.md maps SRCH-02, SECU-01, SECU-02 to Phase 3. These are explicitly deferred in ROADMAP.md with documented rationale — not missing work. No plan ran tasks against them, which is consistent with the deferral.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/components/search-input.tsx` | 48 | `placeholder="Search casks…"` | Info | HTML attribute value — not a code stub; expected in search input |
| `src/components/header.tsx` | 51 | `placeholder="Search casks…"` | Info | In Suspense fallback disabled input — not a code stub; expected |

No TBD, FIXME, or XXX markers found in any phase-modified file. No empty return stubs found. No hardcoded empty data arrays in data-rendering paths.

### Human Verification Required

#### 1. Live search in browser with DB results

**Test:** Navigate to /browse in a running instance; type "visual studio" into the header search input
**Expected:** After ~300ms, the URL updates to /browse?q=visual+studio and cask results appear with a result count (e.g. "3 results for 'visual studio'"); the Pagination component is absent from the page
**Why human:** Requires live DB query over real Neon data, browser rendering of debounced URL updates, and visual inspection that Pagination is absent

#### 2. Browser back button behavior

**Test:** Perform a search from /browse, observe URL change to /browse?q=..., then press browser back
**Expected:** Back navigation exits /browse entirely (navigates away) rather than iterating through intermediate query states — confirms router.replace avoided history stack pollution
**Why human:** Browser history stack behavior requires live browser interaction; cannot be verified by static analysis

#### 3. Browse page skeleton loading state

**Test:** Navigate to /browse with Chrome DevTools Network throttled to Slow 3G
**Expected:** A grid of 12 animate-pulse skeleton cards appears instantly before the server component renders; no visual layout shift when real CaskCard content arrives
**Why human:** Timing, visual shimmer animation, and layout-shift absence require live browser observation

#### 4. Cask detail page skeleton loading state

**Test:** Navigate to any /cask/[token] URL (e.g. /cask/visual-studio-code) with throttled network
**Expected:** Skeleton back-nav, 80x80 icon block, h1 block, install code block, and three stat tiles appear before real content; no layout shift on content arrival
**Why human:** Visual fidelity and no-layout-shift require live browser comparison against real page dimensions

#### 5. Clear search input restores paginated browse

**Test:** Type a valid query (>=2 chars), wait for results; then clear the input (delete all characters)
**Expected:** URL reverts to /browse (no ?q), the normal paginated card grid reappears with the Pagination component visible
**Why human:** Requires live browser interaction to verify the params.delete('q') code path and paginated grid restoration

---

## Gaps Summary

No gaps found. All 9 must-have truths are VERIFIED. All required artifacts exist and are substantive, wired, and flowing with real data. No blocker anti-patterns detected.

The deferred requirements (SRCH-02, SECU-01, SECU-02) are explicitly documented in ROADMAP.md Phase 3 with rationale and do not affect Phase 3 success criteria satisfaction.

Human verification is required for 5 browser-behavioral checks that cannot be assessed by static analysis.

---

_Verified: 2026-05-25T15:28:37Z_
_Verifier: Claude (gsd-verifier)_
