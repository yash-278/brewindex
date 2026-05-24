# Phase 2: Catalog UI - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver the visual catalog: a browse grid of all ~7,659 casks and a detail page per cask — from which a user can copy the install command and see stats. No search, no category filter, no sort controls — those are Phase 3 and 4. Pure read path consuming the `casks` table Phase 1 populated.

**Requirements in scope:** BRWS-01, BRWS-04, DETL-01, DETL-02, DETL-03, DETL-04

**Success Criteria (from ROADMAP.md):**
1. The browse page shows casks in a visual card grid with icon, name, and short description — sorted by popularity by default — and is served from CDN via ISR (no per-request Postgres queries)
2. A user can scroll or paginate through 7,000+ casks without the page crashing, erroring, or loading for more than 3 seconds on a standard connection
3. Clicking a cask opens a detail page showing name, icon, description, current version, last-updated date, homepage link, and 30d/90d/365d install counts
4. A single click on the detail page copies `brew install --cask <token>` to the clipboard with visible confirmation feedback
5. The top-500 detail pages (by install count) are pre-rendered at build time; the remaining pages render on-demand and cache via ISR

**NOTE — Sketch-first gate:** Per CLAUDE.md constraint, `/gsd-sketch` must be run BEFORE any production UI is built. The planner should treat sketching as the first plan step, or assume sketches will be produced before implementation begins. The design decisions in this CONTEXT.md (visual mood, density) seed the sketch session.

</domain>

<decisions>
## Implementation Decisions

### Sketch-First Gate
- **D-01:** Run `/gsd-sketch` on browse grid + detail page before any production UI is built. CLAUDE.md mandates this and it is a hard constraint, not optional.
- **D-02:** Visual mood: dark / developer-first. Dark background, muted colors, developer-adjacent aesthetic (think GitHub or Raycast style). Light mode is out of scope for this phase.
- **D-03:** Sketch session should produce 2-3 variations of both browse grid and detail page. Design system (spacing, colors, card shape, typography) derives from the chosen variation.

### Browse Pagination
- **D-04:** Cursor/page-based pagination. URL-driven (`?page=N`). Each page is a distinct ISR-cached Server Component — Postgres only runs for cache misses. No infinite scroll (breaks ISR, adds client complexity).
- **D-05:** 48 casks per page. Divisible by 2, 3, and 4 — renders a clean grid at all common column counts. ~145 pages total at current cask count.
- **D-06:** Default sort: `install_365d DESC` (most popular). Matches success criterion 1 explicitly, and surfaces recognizable apps (VSCode, Slack, etc.) for newcomers.

### Card Information Density
- **D-07:** Cards show: icon + name + description. No install count badge, no version, no extra metadata on the card. Stats and counts belong on the detail page.
- **D-08:** Fallback icon (when `icon_is_fallback = true`): CSS initials avatar — colored square/circle with 1-2 initials from the cask name. Color derived from name hash for consistency. No broken image states.
- **D-09:** Description truncated to 2 lines (`line-clamp-2`). Cards have uniform height. Full description visible on the detail page.

### App Shell & Chrome
- **D-10:** Root route (`/`) redirects to `/browse`. No landing/marketing page in Phase 2.
- **D-11:** Cask detail page URL: `/cask/[token]`. Clean, readable, collision-safe. Example: `/cask/visual-studio-code`.
- **D-12:** Header: BrewIndex branding + placeholder search bar (non-functional, grayed out with "Search casks…" hint text). Establishes visual identity now; prevents jarring layout shift when Phase 3 wires in real search.

### Claude's Discretion
- Exact column count breakpoints (responsive grid — e.g., 2-col mobile, 3-col tablet, 4-col desktop)
- shadcn/ui card variant choice (which Card subcomponents to use)
- ISR revalidation tag strategy (must use `revalidateTag('casks')` consistent with Phase 1)
- `generateStaticParams` implementation details for top-500 pages
- Metadata (page title, OG tags) for browse and detail pages
- Error/not-found handling for invalid cask tokens
- Clipboard API implementation for the copy-install-command feature

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — Core value, constraints, key decisions table
- `.planning/REQUIREMENTS.md` — BRWS-01, BRWS-04, DETL-01–04 with acceptance criteria; traceability table

### Roadmap & Phase Scope
- `.planning/ROADMAP.md` §Phase 2 — Goal, success criteria, requirements list

### Prior Phase Context
- `.planning/phases/01-data-pipeline/01-CONTEXT.md` — Schema decisions (D-05, D-06), ISR tag (`revalidateTag('casks')`), icon fallback strategy, `is_active` filter requirement

### Stack Reference (from CLAUDE.md)
- `CLAUDE.md` §Technology Stack — Next.js App Router ISR patterns, shadcn/ui card components, Tailwind v4 CSS-first config, `next/image` remote patterns for icon URLs, Neon serverless driver
- `CLAUDE.md` §Key Constraints & Gotchas — #10 (ISR and generateStaticParams for 17K pages — top-500 cutoff), #2 (no icon field, fallback chain), #6 (Tailwind v4 breaking changes)

### Codebase: Existing Schema
- `src/db/schema.ts` — Live `casks` table definition; all available fields for UI rendering

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts` — `CaskSelectRow` type; all fields available for the UI (token, name, description, version, homepage, icon_url, icon_is_fallback, install_30d/90d/365d, last_synced_at, is_active)
- `src/db/index.ts` — Drizzle db client; import directly in Server Components and route handlers
- `src/lib/fetch-allowlist.ts` — SSRF-safe fetch wrapper; use for any server-side HTTP calls in Phase 2

### Established Patterns
- ISR via `revalidateTag('casks')` — Phase 1 calls this after sync; Phase 2 pages must register with `fetch(..., { next: { tags: ['casks'] } })` or `unstable_cache` with the same tag
- `icon_is_fallback` boolean — always check this before rendering `<Image>` with `icon_url`; render initials avatar when true
- `is_active` filter — all queries must filter `WHERE is_active = true`; soft-deleted casks must not appear

### Integration Points
- Browse page reads from `casks` table ordered by `install_365d DESC` with `LIMIT 48 OFFSET (page-1)*48`
- Detail page reads a single cask by `token` from `casks` table
- `generateStaticParams` for `/cask/[token]`: query top-500 casks by `install_365d DESC`, return their tokens
- `revalidateTag('casks')` fired by Phase 1 cron will automatically invalidate browse and detail pages

</code_context>

<specifics>
## Specific Ideas

- Visual aesthetic: dark/developer-first, similar to GitHub or Raycast. Muted tones, not high-contrast white.
- Placeholder search bar in header: grayed out, "Search casks…" hint text, no functionality in Phase 2 — just preserves layout for Phase 3.
- Install command copy: single-click on detail page, visible confirmation feedback (e.g., button changes to "Copied!" for ~2 seconds). Standard Clipboard API, no library needed.
- Initials avatar: derive color from name hash so the same cask always gets the same color. Avoids the "all gray boxes" problem.

</specifics>

<deferred>
## Deferred Ideas

- Dark mode toggle / light mode — deferred to a future phase or post-MVP
- Category filter on browse grid — Phase 4 (Discovery Layer)
- Sort controls (by alphabet, recently updated) — Phase 4
- Search functionality — Phase 3
- GitHub stats block on detail page — Phase 4 (DETL-05)
- Platform compatibility filter — Phase 3
- Cask caveats and install warnings — v2 requirement

</deferred>

---

*Phase: 2-Catalog UI*
*Context gathered: 2026-05-24*
