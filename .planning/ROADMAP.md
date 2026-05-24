# Roadmap: BrewIndex

## Overview

BrewIndex ships in four vertical slices, each delivering a complete end-to-end capability. The data pipeline comes first because nothing else is possible without a populated database. The catalog UI follows, giving users a working browse-and-install experience. Search and security hardening turn the catalog into a production-grade product. The final discovery layer adds the category and sorting features that make BrewIndex feel like an App Store rather than a package list.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Data Pipeline** - Sync job, Postgres schema, icon/GitHub enrichment, and security hardening for the cron endpoint
- [ ] **Phase 2: Catalog UI** - Design sketches, browse grid, cask detail pages with install copy and stats
- [ ] **Phase 3: Search + Security** - Name search, platform filter, rate limiting, and WAF rules
- [ ] **Phase 4: Discovery Layer** - Category filter, sorting, GitHub stats on detail pages

## Phase Details

### Phase 1: Data Pipeline

**Goal**: The database is populated with all Homebrew cask data, icons, and GitHub stats, refreshed daily by a secured cron job
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: DATA-01, DATA-02, DATA-03, SECU-03, SECU-04
**Success Criteria** (what must be TRUE):

  1. Running the cron endpoint (with valid CRON_SECRET) populates Neon Postgres with all ~7,659 casks including name, token, description, version, homepage, and comma-stripped install counts
  2. Each cask row has an icon URL pointing to a Vercel Blob asset (or a CSS initials fallback flag) — no hotlinked external favicons
  3. Casks with a GitHub upstream repo (excluding Google Font packs) have stars, forks, and open issue counts stored in the database
  4. Calling the cron endpoint without a valid Bearer token returns 401 and performs no work
  5. All server-side HTTP calls in the sync job are restricted to the explicit allowlist (formulae.brew.sh, api.github.com, Blob storage); any off-allowlist URL is blocked at the fetch wrapper

**Plans**: 5 plans

Plans:

- [x] 01-01-PLAN.md — Walking skeleton: scaffold, Drizzle schema, SSRF wrapper, cron auth guard, one-cask proof
- [x] 01-02-PLAN.md — Full cask sync: homebrew.ts service, 7,659-cask batch upsert, seed script
- [x] 01-03-PLAN.md — Icon pipeline: DuckDuckGo favicon fetch, Vercel Blob upload, fallback flag
- [x] 01-04-PLAN.md — GitHub enrichment: throttled Octokit, stats for 1,083 casks, full pipeline complete
- [x] 01-05-PLAN.md — Gap closure: complete RFC 1918 SSRF block, all-four-env-var validation, retry cap, icon fault isolation, Fluid Compute opt-in, is_active filters

### Phase 2: Catalog UI

**Goal**: Users can browse the full cask catalog visually and get everything they need to install an app from its detail page
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: BRWS-01, BRWS-04, DETL-01, DETL-02, DETL-03, DETL-04
**Success Criteria** (what must be TRUE):

  1. The browse page shows casks in a visual card grid with icon, name, and short description — sorted by popularity by default — and is served from CDN via ISR (no per-request Postgres queries)
  2. A user can scroll or paginate through 7,000+ casks without the page crashing, erroring, or loading for more than 3 seconds on a standard connection
  3. Clicking a cask opens a detail page showing name, icon, description, current version, last-updated date, homepage link, and 30d/90d/365d install counts
  4. A single click on the detail page copies `brew install --cask <token>` to the clipboard with visible confirmation feedback
  5. The top-500 detail pages (by install count) are pre-rendered at build time; the remaining pages render on-demand and cache via ISR

**Plans**: 3 plans
Plans:
**Wave 1**

- [x] 02-01-PLAN.md — Foundation: shadcn init, design tokens (globals.css), next/image config, lib utilities (queries, format, hash, blur-data-url)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 02-02-PLAN.md — Browse slice: root redirect, header, CaskCard, CaskGrid, Pagination, browse page assembly (BRWS-01, BRWS-04)
- [x] 02-03-PLAN.md — Detail slice: CopyButton client island, detail page hero/install/stats/metadata, generateStaticParams top-500, not-found state (DETL-01–04)

### Phase 3: Search + Security

**Goal**: Users can find specific casks by name and filter by platform, and the public API surface is protected against abuse
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SRCH-01, SRCH-02, SECU-01, SECU-02
**Success Criteria** (what must be TRUE):

  1. Typing a cask name into the search bar returns matching results from the database (server-side Postgres query) without shipping the full 15.5 MB corpus to the browser
  2. Search results can be filtered to show only casks compatible with a specific macOS platform (e.g., arm64, x86_64)
  3. Any IP that exceeds the rate limit on a public API route receives a 429 response; legitimate users are unaffected at normal usage patterns
  4. Vercel WAF rules are active and block known bot patterns and abusive traffic before they reach the application

**Plans**: TBD

### Phase 4: Discovery Layer

**Goal**: Users can explore the catalog by category and sort order, and casks with GitHub repos show social proof metrics on their detail pages
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRWS-02, BRWS-03, DETL-05
**Success Criteria** (what must be TRUE):

  1. The browse page has a category filter (Developer Tools, Productivity, Design, etc.) that narrows the visible card grid to matching casks
  2. Users can re-sort the browse grid by install count (most popular), alphabetical order, or most recently updated — and the sort persists across pagination
  3. Cask detail pages for apps with a GitHub upstream repo display a GitHub stats block showing stars, forks, and open issues

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 0/5 | Not started | - |
| 2. Catalog UI | 0/3 | Not started | - |
| 3. Search + Security | 0/? | Not started | - |
| 4. Discovery Layer | 0/? | Not started | - |
