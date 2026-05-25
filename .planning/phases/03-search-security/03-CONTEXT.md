# Phase 3: Search + Security - Context

**Gathered:** 2026-05-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Wire up real search on the browse grid (replacing the placeholder input), fix page transition jank with skeleton loading states, and harden the site with basic WAF protection.

**Requirements in scope:** SRCH-01 (name search), SRCH-02 (platform filter/context), SECU-01 (partially — deferred full rate limiting), SECU-02 (WAF managed rulesets)

**Out of scope:** Full-text description search (SRCH-03, v2), user accounts, rate limiting via Upstash (deferred), custom WAF rules (deferred)

</domain>

<decisions>
## Implementation Decisions

### Search UX
- **D-01:** Search filters the browse grid in place. Results stay on `/browse`, URL updates with `?q=vscode`. No separate `/search` page.
- **D-02:** Live as-you-type with ~300ms debounce. Fires a request after the user pauses typing, not on every keystroke.
- **D-03:** When search is active, pagination is hidden. Search shows up to a capped set of results (no paging). Pagination only appears when `?q` param is absent.
- **D-04:** The header search input (currently `disabled` placeholder) becomes a client component that manages the query string via `useRouter` / `useSearchParams`.

### Search Backend
- **D-05:** Postgres full-text search using `tsvector`. NOT `ILIKE` — fuzzy/ranked matching is preferred.
- **D-06:** Schema migration: add `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))) STORED` column to the `casks` table.
- **D-07:** GIN index on `search_vector` for fast `@@` queries.
- **D-08:** New API route `/api/search?q=...` returns full cask rows for matching casks (all columns — no partial projection). Protected by the existing SSRF/allowlist wrapper.
- **D-09:** Search query uses `plainto_tsquery('english', $1)` against the `search_vector` column — tolerates natural phrasing without requiring tsquery syntax from users.
- **D-10:** Result cap: 50 results max. Ordered by `ts_rank(search_vector, query) DESC` then `install_365d DESC` as tiebreaker.

### Page Transition Jank
- **D-11:** Add `loading.tsx` to both `/browse` and `/cask/[token]` routes. Next.js App Router uses these as instant Suspense fallbacks during server render.
- **D-12:** Loading state: skeleton card grid — N placeholder cards with shimmer/pulse animation matching the real `CaskCard` layout (icon square + name line + description lines). No layout shift between skeleton and real content.
- **D-13:** Both routes get loading states: `/browse` (pagination transitions) and `/cask/[token]` (opening a cask detail page).

### WAF / Security
- **D-14:** Enable Vercel WAF managed rulesets only. No custom rules in this phase. This covers common bot patterns and attack vectors with a single toggle.
- **D-15:** Rate limiting (SECU-01 via `@upstash/ratelimit`) deferred. The user notes Next.js/Vercel handles much of this at the CDN layer, and the browse/detail pages are cached ISR. Revisit when real traffic patterns emerge.

### Claude's Discretion
- Exact debounce duration (300ms recommended)
- Skeleton shimmer implementation (CSS animation or Tailwind `animate-pulse`)
- Whether to show a result count ("14 results for 'vscode'") in the browse grid header
- Minimum query length before search fires (suggest: 2 chars)
- Empty search state copy and icon
- Error state if `/api/search` fails (suggest: silent fallback to full browse grid)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — SRCH-01, SRCH-02, SECU-01, SECU-02 acceptance criteria

### Roadmap & Phase Scope
- `.planning/ROADMAP.md` §Phase 3 — Goal, success criteria, requirements list

### Prior Phase Context
- `.planning/phases/02-catalog-ui/02-CONTEXT.md` — Header placeholder search bar (D-12), URL-driven pagination pattern, dark aesthetic, ISR tag (`revalidateTag('casks')`)
- `.planning/phases/01-data-pipeline/01-CONTEXT.md` — Schema decisions, `is_active` filter, Drizzle + Neon patterns

### Codebase: Key Files
- `src/lib/queries.ts` — All existing Drizzle queries; new `searchCasks` query goes here
- `src/db/schema.ts` — Current `casks` table; add `search_vector` generated column via migration
- `src/components/header.tsx` — Contains the disabled search input to be wired up (make it a client component)
- `src/app/browse/page.tsx` — Add `?q` param reading; switch between paginated grid and search results
- `src/components/cask-grid.tsx` — Reused for search results rendering
- `src/app/api/` — New `/api/search` route goes here

### Stack Reference
- `CLAUDE.md` §Technology Stack — Neon serverless driver, Drizzle ORM patterns, Next.js App Router ISR
- `CLAUDE.md` §Key Constraints & Gotchas — #8 (Neon cold start), #1 (dataset size)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CaskGrid` component — already renders an array of casks; search results can be passed directly to it
- `CaskCard` component — reuse as-is for search result cards
- `getCasksPage` / `getCasksCount` in `queries.ts` — pattern for new `searchCasks` query
- `src/lib/fetch-allowlist.ts` — SSRF wrapper used by all server-side fetches; `/api/search` is internal DB query so no allowlist needed, but cron/revalidate routes already show the auth pattern

### Established Patterns
- URL-driven state: browse uses `?page=N` — search extends this with `?q=...`
- `unstable_cache` with `tags: ['casks']` — search results can be cached the same way with a short TTL or skipped entirely (search is dynamic by nature)
- `PAGE_SIZE` constant in `queries.ts` — search result cap (50) should follow the same single-source-of-truth pattern

### Integration Points
- Header `<input>` (`header.tsx`) → needs to become a `'use client'` component or extract the search input into its own client island
- `browse/page.tsx` → reads `searchParams.page`; extend to also read `searchParams.q` and branch: if `q` present → call `searchCasks`, hide `<Pagination>`, show result count
- New: `app/api/search/route.ts` → GET handler, reads `?q`, calls Drizzle tsvector query, returns JSON
- New: `app/browse/loading.tsx` → skeleton grid (matches 2-col layout)
- New: `app/cask/[token]/loading.tsx` → skeleton detail page hero

</code_context>

<specifics>
## Specific Ideas

- User explicitly chose **tsvector over ILIKE** — they want fuzzy/quality search, not just substring matching
- User explicitly chose **skeleton cards** as the loading state — not a spinner or progress bar
- Rate limiting intentionally deferred — user's rationale: Next.js + Vercel CDN layer handles most of it; don't add Upstash complexity without real traffic data

</specifics>

<deferred>
## Deferred Ideas

- **Rate limiting (SECU-01)** — deferred by user decision. Upstash `@upstash/ratelimit` is already in `package.json`. Revisit in Phase 4 or when real traffic patterns emerge.
- **Custom WAF rules (SECU-02 extended)** — only managed rulesets in this phase. Custom bot/scraper rules deferred until threat patterns are known.
- **Full-text description search (SRCH-03)** — marked v2 in REQUIREMENTS.md. The tsvector column added in this phase covers `name + description`, which gives SRCH-03 for free if the search API includes `description` in the vector. Worth noting: D-06 already includes `description` in the generated column — so SRCH-03 is technically covered by this implementation.
- **Sort controls (BRWS-03)** — Phase 4 (Discovery Layer)
- **Category filter (BRWS-02)** — Phase 4 (Discovery Layer)

</deferred>

---

*Phase: 3-search-security*
*Context gathered: 2026-05-25*
