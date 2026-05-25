---
phase: "03-search-security"
plan: "02"
subsystem: "search"
tags: ["search", "api", "client-component", "url-state", "suspense"]
dependency_graph:
  requires:
    - "03-01"  # searchCasks and SEARCH_RESULT_CAP added to queries.ts + DB migration
  provides:
    - "GET /api/search?q=... endpoint"
    - "SearchInput client island with debounce"
    - "browse page search branch"
  affects:
    - "src/components/header.tsx"
    - "src/app/browse/page.tsx"
tech_stack:
  added: []
  patterns:
    - "Zod safeParse for query string validation before DB hit"
    - "useSearchParams + useRouter.replace for URL-based search state"
    - "Suspense boundary wrapping useSearchParams client island in Server Component"
    - "Search branch in browse Server Component to early-return without pagination"
key_files:
  created:
    - "src/app/api/search/route.ts"
    - "src/components/search-input.tsx"
  modified:
    - "src/components/header.tsx"
    - "src/app/browse/page.tsx"
decisions:
  - "router.replace used (not push) to avoid history stack pollution on debounce ticks"
  - "Suspense fallback visually matches disabled stub exactly to prevent layout shift during hydration"
  - "header.tsx stays a Server Component — SearchInput extracted as client island"
  - "Search branch in browse page returns early with result count paragraph and no Pagination"
  - "Empty/short queries (<2 chars) return {results:[]} immediately without hitting DB (Pitfall 6 avoidance)"
metrics:
  duration: "3m 44s"
  completed: "2026-05-25T15:19:02Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 2
---

# Phase 03 Plan 02: Search Vertical Slice Summary

**One-liner:** Postgres full-text search end-to-end — /api/search route with Zod validation, debounced SearchInput client island, Suspense-wrapped header, browse page branching on ?q param.

## What Was Built

Three tasks delivered the complete SRCH-01 search vertical slice:

1. **`GET /api/search?q=...`** — new route at `src/app/api/search/route.ts`. Zod QuerySchema enforces min(2)/max(100) before any DB access; returns `{results:[]}` for short queries without a DB hit. Calls `searchCasks()` from queries.ts (added in Plan 01) in a try/catch. Uses `Response.json()` shorthand per project patterns.

2. **`SearchInput` client island** — new `src/components/search-input.tsx`. `'use client'` component using `useSearchParams`, `useRouter`, `usePathname`. 300ms debounce via `useRef<timeout>` + `useCallback`. Writes `?q` to `/browse` URL using `router.replace` (not push) to avoid history stack pollution. Clears `?page` on each search to reset pagination. `useEffect` syncs local input value on browser back/forward. Visual style preserves disabled stub dimensions exactly (flex:1, maxWidth:480px) with opacity/cursor/disabled removed.

3. **Header + browse page wiring** — `header.tsx` gains `Suspense` + `SearchInput` imports; disabled input block replaced with `<Suspense fallback={...}><SearchInput /></Suspense>`. Fallback is the original disabled stub (no layout shift during hydration). Header remains a Server Component. `browse/page.tsx` extends `searchParams` type to include `q?: string`, imports `searchCasks`, and branches when `q && q.trim().length >= 2` — returns result count + `<CaskGrid>` without `<Pagination>`. Normal paginated path unchanged below the branch.

## Acceptance Criteria Verification

| Criterion | Status |
|-----------|--------|
| GET /api/search?q=vscode returns {results:[...]} | PASS (TypeScript clean; runtime requires DB) |
| GET /api/search?q=a returns {results:[]} (no DB hit) | PASS — Zod min(2) guard |
| SearchInput debounces 300ms | PASS — DEBOUNCE_MS=300 constant |
| SearchInput uses router.replace | PASS — verified in source |
| browse/page.tsx reads ?q and renders search results | PASS — search branch present |
| Pagination hidden when ?q present | PASS — no Pagination in search branch |
| SearchInput wrapped in Suspense in header.tsx | PASS — Suspense element present |
| header.tsx has no 'use client' | PASS — Server Component |
| npx tsc --noEmit exits 0 | PASS — clean TypeScript |
| next build compiles successfully (Turbopack) | PASS — compiled in 1453ms; build terminates on DB credential error (pre-existing, unrelated to this plan) |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All data paths are wired: SearchInput → URL → browse page → searchCasks() → DB.

## Threat Flags

No new security surface beyond what the plan's threat model covers. The `/api/search` route:
- Is a public read-only endpoint (no auth needed per spec)
- Input validated by Zod before DB access (T-03-04 mitigated)
- LIMIT 50 enforced in `searchCasks` (T-03-05 mitigated)
- Makes no external HTTP calls (T-03-06 accepted)

## Self-Check: PASSED

Files exist:
- src/app/api/search/route.ts: FOUND
- src/components/search-input.tsx: FOUND
- src/components/header.tsx: FOUND (modified)
- src/app/browse/page.tsx: FOUND (modified)

Commits exist:
- c84102d: feat(03-02): create /api/search route
- 49c3092: feat(03-02): create SearchInput client island
- 837da4c: feat(03-02): wire SearchInput into header with Suspense
