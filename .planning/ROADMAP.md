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
- [x] **Phase 5.1: Migrate Icon Storage to Railway Bucket** [INSERTED] - Replace Vercel Blob with Railway S3 bucket (Tigris), retire BLOB_READ_WRITE_TOKEN, clear old icon_url rows for re-sync
- [ ] **Phase 3: Search + Security** - Name search, platform filter, rate limiting, and WAF rules
- [ ] **Phase 4: Discovery Layer** - Category filter, sorting, GitHub stats on detail pages
- [ ] **Phase 5: Railway Migration** - Move backend and Postgres to Railway hobby tier ($5/mo), cron setup on Railway, monorepo strategy

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

### Phase 5.1: Migrate Icon Storage to Railway Bucket [INSERTED]

**Goal**: Replace Vercel Blob with the Railway S3-compatible bucket (`roomy-breadbox`) so icon storage has no per-operation quota and is co-located with the backend that writes it
**Mode:** mvp
**Depends on**: Phase 5
**Requirements**: DATA-03 (icon pipeline)
**Success Criteria** (what must be TRUE):

  1. `src/lib/icons.ts` writes icons to the Railway S3 bucket (`roomy-breadbox`) using `@aws-sdk/client-s3` — `@vercel/blob` is no longer imported or called
  2. Icons are publicly readable via the bucket's virtual-hosted-style URL (`https://<bucket>.t3.storageapi.dev/<key>`)
  3. `next.config.ts` `remotePatterns` allows the new storage hostname; the Vercel Blob pattern is removed
  4. The SSRF allowlist (`fetch-allowlist.ts`) permits the Railway storage endpoint
  5. All existing `icon_url` rows pointing to `blob.vercel-storage.com` are cleared (set to NULL) so the next sync re-fetches them into the new bucket
  6. New env vars (`S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`) are documented; `BLOB_READ_WRITE_TOKEN` is retired

**Plans**: 1 plan

Plans:

- [x] 05.1-01-PLAN.md — Replace @vercel/blob with @aws-sdk/client-s3; update env validation, remotePatterns, null-out migration script; deploy and smoke test

---

### Phase 3: Search + Security

**Goal**: Users can find specific casks by name, with fast Postgres full-text search, and page transitions are smooth with skeleton loading states
**Mode:** mvp
**Depends on**: Phase 2
**Requirements**: SRCH-01, SRCH-02 (deferred), SECU-01 (deferred), SECU-02 (deferred)
**Success Criteria** (what must be TRUE):

  1. Typing a cask name into the search bar returns matching results from the database (server-side Postgres tsvector query) without shipping the full corpus to the browser
  2. Navigating to /browse or /cask/[token] shows an instant skeleton loading state before the server render completes

**Deferred (user decisions recorded in 03-CONTEXT.md):**
- SRCH-02 (platform filter): No platform data in schema; requires Phase 1 backfill. Deferred per planning context.
- SECU-01 (rate limiting): Deferred per D-15. Upstash ratelimit already in package.json; revisit Phase 4.
- SECU-02 (WAF managed rulesets): Requires Enterprise plan. Deferred per planning context.

**Plans**: 3 plans

**Wave 1** *(parallel — no dependencies)*

- [x] 03-01-PLAN.md — DB + query layer: tsvector column, GIN index, drizzle-kit generate+migrate [BLOCKING], searchCasks function (SRCH-01)
- [x] 03-03-PLAN.md — Loading skeletons: browse/loading.tsx and cask/[token]/loading.tsx pulse cards (D-11, D-12, D-13)

**Wave 2** *(blocked on 03-01)*

- [x] 03-02-PLAN.md — Search vertical slice: /api/search route, SearchInput client island, header wiring with Suspense, browse page ?q branch (SRCH-01)

### Phase 4: Discovery Layer

**Goal**: Users can explore the catalog by category and sort order, and casks with GitHub repos show social proof metrics on their detail pages
**Mode:** mvp
**Depends on**: Phase 3
**Requirements**: BRWS-02, BRWS-03, DETL-05
**Success Criteria** (what must be TRUE):

  1. The browse page has a category filter (Developer Tools, Productivity, Design, etc.) that narrows the visible card grid to matching casks
  2. Users can re-sort the browse grid by install count (most popular), alphabetical order, or most recently updated — and the sort persists across pagination
  3. Cask detail pages for apps with a GitHub upstream repo display a GitHub stats block showing stars, forks, and open issues

**Plans**: 4 plans

Plans:

**Wave 1**

- [ ] 04-01-PLAN.md — Schema + query layer: category column, migration, getCasksPageFiltered/getCasksCountFiltered/getCategories (BRWS-02, BRWS-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [ ] 04-02-PLAN.md — Filter/sort UI: CategoryFilter pills, SortDropdown, browse page integration, 4-column responsive grid (BRWS-02, BRWS-03)
- [ ] 04-03-PLAN.md — GitHub stats display: GitHubStatsCard for detail pages, StarBadge for browse cards (DETL-05)
- [ ] 04-04-PLAN.md — ML categorization: AWS Bedrock script, category population, ISR cache invalidation [CHECKPOINT] (BRWS-02)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Data Pipeline | 0/5 | Not started | - |
| 2. Catalog UI | 0/3 | Not started | - |
| 3. Search + Security | 0/3 | Not started | - |
| 4. Discovery Layer | 0/? | Not started | - |
| 5. Railway Migration | 0/4 | Not started | - |
| 5.1. Icon Storage Migration | 1/1 | Complete | 2026-05-25 |

### Phase 5: Railway Migration

**Goal**: The backend (sync cron, API routes) and Postgres database run on Railway hobby tier; the monorepo serves both the Next.js frontend and the Railway backend from a single repository; sleeping/wake-on-request behavior replaces always-on Vercel Functions for backend routes
**Mode:** mvp
**Depends on**: Phase 4
**Requirements**: RAIL-01, RAIL-02, RAIL-03, RAIL-04, RAIL-05
**Success Criteria** (what must be TRUE):

  1. Postgres runs on Railway (not Neon); all existing Drizzle queries continue to work against the Railway-managed Postgres instance
  2. The sync cron job runs on Railway (not Vercel Cron) — Railway's built-in cron scheduler triggers the sync on the configured schedule with no additional cost
  3. The Next.js frontend (Vercel) and Railway backend coexist in the same git repository without build interference
  4. Railway services sleep when idle and wake on the first request with acceptable cold-start latency for background/cron workloads
  5. All environment variables (DB connection string, cron secret, etc.) are migrated to Railway without leaking to the frontend Vercel deployment

**Plans**: 4 plans

Plans:

**Wave 1** *(parallel — no dependencies)*

- [x] 05-01-PLAN.md — DB driver swap: replace @neondatabase/serverless with pg + drizzle-orm/node-postgres, provision Railway Postgres, drizzle-kit push [BLOCKING]
- [x] 05-02-PLAN.md — Vercel revalidate webhook: new GET /api/revalidate route handler for ISR cache invalidation

**Wave 2** *(blocked on 05-01)*

- [x] 05-03-PLAN.md — Backend scaffold: backend/ directory, Hono server, sync handler port from Next.js route, Railway cron trigger script

**Wave 3** *(blocked on 05-01 + 05-02 + 05-03)*

- [x] 05-04-PLAN.md — Deployment cutover: remove Vercel cron config, railway.toml, Railway service creation, end-to-end smoke test [CHECKPOINT]
