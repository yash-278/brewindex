# Phase 4: Discovery Layer - Context

**Gathered:** 2026-05-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Add App Store-like discovery features to the browse catalog: category filtering, sort controls (popularity/alphabetical/recently updated), and GitHub social proof (stars/forks/issues) on detail pages and browse cards. Fix pagination UX issues (back-button state restoration, loading skeletons). Optimize layout for large screens (responsive 1/2/3/4-column grid).

**Requirements in scope:** BRWS-02 (category filter), BRWS-03 (sort controls), DETL-05 (GitHub stats on detail pages)

**Out of scope:** Search improvements (Phase 3), user accounts, personalization, dependency graphs (v2)

</domain>

<decisions>
## Implementation Decisions

### Category System
- **D-01:** Category source: first check if Homebrew API provides category/tag data in the cask JSON; if not available, run a one-time ML categorization job via AWS Bedrock (small model, local inference) to categorize all ~7,659 casks.
- **D-02:** Category taxonomy: let the model decide organically — unsupervised clustering from cask descriptions. No predetermined category list; let data-driven groupings emerge.
- **D-03:** Storage: add a `category` column to the `casks` table (or separate mapping table) populated during sync pipeline enrichment. Category assignment happens at data pipeline time, not runtime.
- **D-04:** Uncategorized casks: allow a fallback "Other" or "Uncategorized" category for casks that don't fit cleanly.

### Sort & Filter UI
- **D-05:** Filter/sort controls live on the `/browse` page (local scope), not in the global header. Filter pills/buttons above the card grid; sort dropdown next to them.
- **D-06:** State persistence: URL query params (`/browse?category=developer-tools&sort=alphabetical`). ISR-friendly, shareable links, back-button works correctly. Consistent with existing pagination and search patterns.
- **D-07:** Sort options: popularity (365d install count DESC — default), alphabetical (name ASC), recently updated (last_synced_at DESC).
- **D-08:** Category filter: multi-select pills or single-select tabs (planner decides based on final category count from D-02).

### GitHub Stats Display
- **D-09:** Detail page: dedicated GitHub stats card below the install command section. Prominent social proof block with GitHub logo.
- **D-10:** Metrics shown: all three — stars, forks, open issues. Complete picture of repo health and activity.
- **D-11:** Browse cards: add a star count badge (pill) next to the existing install count pill in the card metadata strip. Only shown for casks with `github_enriched = true`.
- **D-12:** GitHub data availability: casks without GitHub repos (or with `github_enriched = false`) show no GitHub stats. No placeholder or "N/A" — just omit the block/badge.

### Pagination Fixes
- **D-13:** Back-button behavior: full state restoration. When user clicks a cask detail page then hits back, they return to their exact page/filter/sort/scroll position. Use URL state + Next.js scroll restoration.
- **D-14:** Perceived lag fix: add loading skeletons for pagination transitions (consistent with Phase 3's loading states). Skeleton card grid appears instantly while ISR loads the new page.

### Layout Width
- **D-15:** Responsive grid breakpoints: mobile (1 col), tablet (2 cols), desktop 1024px+ (3 cols), wide 1440px+ (4 cols). Fully adaptive to screen size.
- **D-16:** Card sizing: uniform height maintained across all column counts. No layout shift between breakpoints.

### the agent's Discretion
- Exact breakpoint pixel values for 2/3/4-column transitions (suggest: 640px, 1024px, 1440px — standard Tailwind breakpoints)
- GitHub stats card visual design (icons, spacing, link to repo)
- Filter pill vs tab UI choice based on final category count
- Loading skeleton animation (CSS pulse or shimmer)
- Sort dropdown component (shadcn/ui Select or native select)
- Scroll restoration implementation details (Next.js built-in or manual history state)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — Core value, constraints, key decisions
- `.planning/REQUIREMENTS.md` — BRWS-02, BRWS-03, DETL-05 acceptance criteria

### Roadmap & Phase Scope
- `.planning/ROADMAP.md` §Phase 4 — Goal, success criteria, requirements list

### Prior Phase Context
- `.planning/phases/03-search-security/03-CONTEXT.md` — Search implementation (tsvector, query patterns), loading skeletons, URL-driven state (`?q=...`)
- `.planning/phases/02-catalog-ui/02-CONTEXT.md` — Browse grid layout, CaskCard component, pagination pattern, dark aesthetic, ISR caching
- `.planning/phases/01-data-pipeline/01-CONTEXT.md` — Schema decisions, sync pipeline, GitHub enrichment (`github_stars`, `github_forks`, `github_issues` columns), `is_active` filter

### Codebase: Key Files
- `src/db/schema.ts` — `casks` table schema; `github_stars`, `github_forks`, `github_issues` columns already exist from Phase 1; add `category` column for filtering
- `src/lib/queries.ts` — All existing queries (`getCasksPage`, `searchCasks`); new queries for category filtering and custom sorting go here
- `src/components/cask-card.tsx` — Existing card component; add GitHub star badge to metadata strip
- `src/components/pagination.tsx` — Current pagination component; may need scroll restoration logic
- `src/app/browse/page.tsx` — Reads `?page=N` and `?q=...`; extend to also read `?category=...` and `?sort=...`
- `src/app/cask/[token]/page.tsx` — Detail page; add GitHub stats card below install command section

### Stack Reference
- `CLAUDE.md` §Technology Stack — Next.js App Router ISR patterns, shadcn/ui components, Drizzle ORM query patterns
- `CLAUDE.md` §Key Constraints — ISR caching with `revalidateTag('casks')`, URL-driven state, responsive grid

No external specs — requirements fully captured in decisions above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `CaskCard` component — metadata strip already has install count pill; add star count pill using same styling pattern
- `getCasksPage` query pattern — extend with `.where()` for category filter and dynamic `.orderBy()` for sort options
- `searchCasks` query — similar filtering pattern can be applied to category filtering (both are dynamic WHERE clauses)
- `src/lib/format.ts` `formatInstallCount` — reuse for formatting GitHub star counts (e.g., "12.3k stars")
- Loading skeletons from Phase 3 (`browse/loading.tsx`) — same skeleton card grid pattern works for pagination transitions

### Established Patterns
- URL-driven state: `?page=N`, `?q=...` already work; add `?category=...` and `?sort=...` as additional params
- ISR caching with `unstable_cache` and `tags: ['casks']` — category/sort queries must follow this pattern
- `PAGE_SIZE` constant (48 casks/page) — maintain consistency across all browse queries
- Dark aesthetic with pill badges (`border`, `borderRadius`, `background` with alpha) — extend to star count badge
- `is_active` filter — all queries must filter `WHERE is_active = true`

### Integration Points
- Browse page (`/browse`) reads `searchParams.page`, `searchParams.q`; extend to also read `searchParams.category` and `searchParams.sort`
- New category filter UI above `<CaskGrid>` on browse page
- New sort dropdown next to category filter
- Detail page hero section → add GitHub stats card below the existing install/version/metadata section
- Drizzle schema migration: add `category text` column to `casks` table
- Sync pipeline (`src/app/api/cron/sync/route.ts` or Railway backend) — add Bedrock categorization step after GitHub enrichment

</code_context>

<specifics>
## Specific Ideas

- **AWS Bedrock for categorization:** Use a small model (e.g., Claude Haiku) via existing AWS Bedrock connection. One-time batch job during sync pipeline enrichment, not runtime inference.
- **Model-driven taxonomy:** Let unsupervised clustering determine the natural category groupings from ~7,659 cask descriptions rather than imposing a predefined App Store taxonomy.
- **Star badge on cards:** Add star count pill next to install count in the metadata strip. Only for casks with GitHub data — no "0 stars" or "N/A" shown.
- **3-column layout for large screens:** User explicitly requested better use of horizontal space on wide displays. Responsive grid adapts: 1/2/3/4 columns based on viewport.

</specifics>

<deferred>
## Deferred Ideas

- **Bedrock token costs:** If Bedrock categorization is too expensive for 7,659 casks, fallback to keyword-based inference or manual curation for the initial launch. Document the decision in planning.
- **Multi-select category filters:** Phase 4 implements single-category filtering (`?category=X`). Multi-category filtering (`?category=X,Y,Z`) is a v2 enhancement.
- **Dependency graphs (BRWS-06):** "Browse by dependency" deferred to v2 per REQUIREMENTS.md.
- **Trending/editorial sections (BRWS-05):** Deferred to v2; Phase 4 focuses on user-driven filtering/sorting, not curated sections.
- **Platform compatibility filter (SRCH-02):** Deferred from Phase 3; still no platform data in schema.

</deferred>

---

*Phase: 4-discovery-layer*
*Context gathered: 2026-05-26*
