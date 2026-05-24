# Project Research Summary

**Project:** BrewIndex
**Domain:** App Store-like software catalog (Homebrew casks)
**Researched:** 2026-05-24
**Confidence:** HIGH

## Executive Summary

BrewIndex is a read-only software discovery catalog backed by the public Homebrew JSON API. The expert pattern for this class of product is a backend cache layer that periodically syncs from the upstream data source into a structured database, combined with a statically rendered frontend that serves CDN-cached pages to users. The Homebrew API publishes a fresh snapshot approximately once daily, making a daily Vercel Cron job the correct sync trigger. Next.js ISR with `revalidateTag` post-sync — not time-based expiry — is the correct freshness mechanism. Neon Postgres (serverless, HTTP driver) is the right primary store: it supports full-text search, structured filtering, and analytics joins that a key-value store cannot handle.

The recommended approach is to build from the data pipeline outward: sync job first, browse grid second, detail pages third, then search and enrichment layers. The core value proposition — a fast, searchable, visually appealing catalog with popularity rankings — is entirely achievable from a single Homebrew JSON fetch per day with no third-party paid services. GitHub star enrichment and category taxonomy are high-value additions that layer on top cleanly. The Vercel Hobby plan is sufficient for launch; Pro is needed only if sync frequency beyond once-per-day is required.

The two most critical risks are infrastructure-level: (1) the Homebrew bulk JSON payload is 15.5 MB and will crash a Vercel serverless function if fetched naively — it must be streamed and written to Postgres in the cron job, never buffered at request time; and (2) ISR revalidation across 7,000+ routes will stampede if time-based TTL expiry is used — tag-based invalidation fired once per daily sync is the correct pattern. Everything else in the pitfall list is real but manageable with standard defensive coding practices.

---

## Recommended Stack

The stack is anchored by Next.js 16 App Router on Vercel with TypeScript throughout. Neon Postgres with the `@neondatabase/serverless` HTTP driver handles the primary data store — the HTTP driver is mandatory on Vercel to avoid TCP connection exhaustion, and Postgres is required over Redis or SQLite for full-text search and analytics joins. Drizzle ORM provides type-safe queries with zero runtime overhead. Tailwind CSS v4 (CSS-first config, no `tailwind.config.js`) with shadcn/ui components produces the App Store-like card grid UI. Upstash Redis via `@upstash/ratelimit` handles distributed rate limiting in Edge Middleware — Vercel KV is deprecated as of December 2024 and must not be used. For search, Postgres `tsvector` with a GIN index should be the production target from day one; client-side Fuse.js is viable only as a very short-lived MVP shortcut given the 15.5 MB corpus.

**Core technologies:**
- **Next.js 16 App Router + TypeScript** — ISR, Server Components, API Routes, Cron all in one deployment unit
- **Neon Postgres + Drizzle ORM** — primary store; HTTP driver required for Vercel serverless; full-text search via `tsvector` GIN index
- **Vercel Cron Jobs** — daily sync trigger; Hobby plan (once/day) sufficient for launch, Pro needed for sub-daily cadence
- **shadcn/ui + Tailwind v4** — copy-paste components, Radix UI accessibility, App Store card aesthetic; no `tailwind.config.js`
- **Upstash Redis + `@upstash/ratelimit`** — distributed rate limiting; replaces deprecated `@vercel/kv`
- **`@octokit/rest` + `@octokit/plugin-throttling`** — GitHub stats enrichment with automatic rate-limit and retry handling
- **Postgres `tsvector` + GIN index** — server-side full-text search; do not ship 15.5 MB corpus to clients

---

## Table Stakes Features

These must ship in v1 or users will leave immediately. formulae.brew.sh has none of them — every gap is a BrewIndex win.

- Visual card/grid browse sorted by install popularity (not alphabetical)
- Full-text search across name, token, and description
- One-click copy of `brew install --cask <token>` — the primary user action
- Cask detail page: current version, description, homepage link, install counts (30d/90d/365d)
- macOS version and architecture compatibility display
- Deprecated/disabled casks hidden from catalog (or shown with prominent warning and replacement link)
- Fast page loads — ISR from CDN; no per-user Postgres queries for catalog pages

**Differentiators worth including in v1:**
- Install count as default sort order ("Most Popular") — unique among package catalogs; analytics data is already in the cask JSON
- "Auto-updates" badge — `auto_updates` boolean in cask JSON, display-only, free
- Caveats block — post-install warnings the CLI buries; high UX value, display-only
- Trending / recently-updated sections — free from analytics data in the sync pipeline

**Defer to v2+:**
- Category/tag browse — highest-impact discovery feature but requires LLM classification or manual curation; no native taxonomy in Homebrew API
- GitHub social proof block (stars, forks, license) — enrichment dependency; display-only once sync is wired up
- Formula (CLI tools) listings — weakens the visual App Store feel; cask catalog must be proven first
- Bundle generator ("select apps → get install script")
- Version history / changelog

---

## Key Architecture Decisions

1. **Cron-writes-to-Postgres, ISR reads from Postgres** — the only component that calls the Homebrew API is the daily cron job. User requests never reach Homebrew. Postgres is the source of truth for all page renders. Homebrew outages do not affect site availability.

2. **`revalidateTag('casks')` for cache invalidation, not time-based TTL** — with 7,659 cask detail pages, time-based `revalidate` firing independently causes a stampede of simultaneous background regenerations. One `revalidateTag` call after each cron run invalidates all tagged pages atomically at O(1) cost.

3. **`generateStaticParams` for top-500 only, `dynamicParams = true` for the rest** — pre-generating all 7,659 routes at build time risks OOM errors and 20-30 minute build times. Top-500 by install count covers the majority of traffic; the rest render on-demand and are cached via ISR.

4. **Icons downloaded to Vercel Blob at sync time, never hotlinked** — no icon field exists anywhere in the Homebrew API. Icons must be sourced from `homepage` domain favicons (DuckDuckGo favicon service) and downloaded to controlled storage at sync time. Hotlinking from arbitrary CDNs breaks in production due to referer checks and CDN policy changes.

5. **Postgres full-text search from day one, not client-side Fuse.js** — the full cask catalog is 15.5 MB uncompressed. Shipping it to browsers for client-side indexing blocks the main thread on mobile and wastes bandwidth. Postgres `tsvector` with a GIN index returns sub-100ms results at this scale.

---

## Top Pitfalls to Avoid

1. **Buffering the 15.5 MB Homebrew JSON in a Vercel function** — stream and parse incrementally in the cron job; never call `cask.json` inside a request handler or `generateStaticParams`. This is a hard crash, not a performance issue.

2. **ISR cache stampede from time-based TTL on 7,000+ routes** — use `revalidateTag('casks')` once after each sync; set individual page `revalidate` to 86400 as a fallback only; never loop `revalidatePath` over all cask tokens.

3. **Vercel Image Optimization cost explosion from proxied icons** — on the Hobby plan, 5,000 image transformations per month is the limit; a single Googlebot crawl of the full grid exhausts it. Store icons in Vercel Blob at sync time; apply explicit `width`/`height`; use `unoptimized={true}` for fixed-dimension icons you control.

4. **Accidental dynamic rendering on ISR catalog pages** — a single `cookies()` or `headers()` call anywhere in the Server Component tree opts the entire route out of static rendering and bills a function invocation per page view. Enforce `export const dynamic = 'error'` on all catalog routes as a build-time guard.

5. **Unauthenticated sync/revalidate endpoints** — AI-generated route handlers frequently omit auth. An unauthenticated `/api/cron/sync` lets any caller exhaust GitHub API quota, spike Vercel function costs, or continuously invalidate the ISR cache. All mutating/privileged endpoints must check `Authorization: Bearer <CRON_SECRET>`.

**Also critical:**
- Parse analytics `count` values as strings with commas (`"17,498"`) — strip commas before `parseInt` or all install counts will be wrong
- Filter Google Font casks (homepage: `fonts.google.com`, ~1,933 casks) before GitHub enrichment to avoid wasting 25% of the API budget
- Wrap shared data-fetch functions in React `cache()` so `generateMetadata` and the page component don't query Postgres twice per render

---

## Surprising Findings

Things that were non-obvious from the project description alone:

- **No icon data exists anywhere in Homebrew.** The cask JSON, the `.rb` definitions, and formulae.brew.sh all have zero icon/image fields. Icon strategy must be built from scratch using the `homepage` domain and favicon services. The Homebrew website itself shows no icons.

- **Vercel KV is deprecated (December 2024).** `@vercel/kv` is marked deprecated on npm. Do not use it. Redis on Vercel now means the Upstash Marketplace integration with `@upstash/redis` directly.

- **Analytics `count` values are locale-formatted strings with commas.** The analytics API returns `"17,498"` not `17498`. Strip commas before `parseInt` in the sync parser or all install counts will be 0 or NaN.

- **Only 54.7% of casks have an extractable GitHub repo.** ~1,933 casks are Google Font packs (homepage: `fonts.google.com`). Filter these before GitHub enrichment.

- **The actual cask count is ~7,659, not 17,236.** The 17,236 figure from the STACK researcher came from `total_items` in the analytics endpoint, which counts install events, not distinct casks. The live `cask.json` confirmed 7,659 unique casks. Use 7,659 as the planning baseline.

- **Homebrew publishes once daily.** The `max-age=600` on the API is a CDN edge-cache TTL, not the data publish frequency. `last-modified` headers confirm one publish per day. A once-daily Vercel Cron on Hobby plan is perfectly aligned with actual data freshness.

- **Category taxonomy has no native source.** There is no category or tag field anywhere in the Homebrew API. Category browse requires LLM classification at sync time (~$12 one-time at GPT-4o-mini rates for 7,000 casks) or manual curation of the top 500 casks. This is a one-time enrichment cost, not a per-request cost.

---

## Recommended Build Order

1. **Database schema and sync job** — Drizzle schema (`casks`, `analytics_snapshots`, `github_stats`), streaming Homebrew fetch + upsert with comma-stripped count parsing, Vercel Cron config, `CRON_SECRET` auth on the endpoint, Zod validation of incoming cask shape, filter `disabled: true` casks at ingest. Run once manually; confirm 7,659 rows in Neon.

2. **Browse grid page** — `app/browse/page.tsx` with ISR (`revalidate=86400`), paginated card grid sorted by install count, icon fallback chain (DuckDuckGo favicon service → CSS initials placeholder), `revalidateTag('casks')` wired into cron. Validate full ISR stack end-to-end.

3. **Cask detail page** — `app/cask/[token]/page.tsx` with ISR + `generateStaticParams` (top-500 by install count, `dynamicParams=true`), `brew install --cask <token>` copy button (Client Component), version/desc/homepage/install-counts display, macOS compat matrix, caveats block, auto_updates badge, deprecated/disabled surfacing.

4. **Server-side search** — Drizzle migration adding `tsvector` column + GIN index, `/api/search` Route Handler with Upstash sliding-window rate limiting in Edge Middleware, `/search?q=` SSR page, search input in navigation.

5. **GitHub enrichment** — `lib/sync/github.ts` with `@octokit/plugin-throttling`, batched fetch (concurrency=10), filter non-GitHub and font-pack casks before calling API, `github_synced_at` 24h TTL check to skip fresh records, GitHub stats block on detail page (conditional on data availability).

6. **Category taxonomy and home page** — LLM classification job (one-time, stored in `casks.category`), category filter on browse page, home page with featured/trending sections, paginated sitemap generation in sync job excluding deprecated/disabled casks.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All choices verified against official docs and live npm registry (2026-05-24). Vercel KV deprecation confirmed. Tailwind v4.3 stability confirmed. |
| Features | HIGH | Verified directly against live Homebrew JSON API, live analytics API, and live formulae.brew.sh. All field names confirmed against real cask records. |
| Architecture | HIGH | ISR patterns confirmed against Next.js docs. Neon + Drizzle integration confirmed. Homebrew API endpoint sizes and shapes confirmed via live fetch. |
| Pitfalls | HIGH | All critical pitfalls verified against official sources: Vercel function limits, GitHub rate limit docs, Next.js rendering model, Vercel billing docs. |

**Overall confidence:** HIGH

### Gaps to address during planning

- **Icon sourcing reliability:** DuckDuckGo's favicon service is widely used in community projects but is not an officially documented production API. Validate icon coverage rate in Phase 2 and have the CSS initials fallback ready from day one.
- **Fuse.js vs. Postgres full-text for the browse page (Phase 2):** The browse grid doesn't require search, but the navigation search bar will need some implementation. Decide during Phase 2 planning whether to stub search or build the Postgres tsvector approach immediately.
- **Vercel Pro plan decision point:** The roadmap works on Hobby (once-daily sync, 3 WAF rules). Flag a Pro upgrade decision if sub-daily freshness or more WAF rule slots become requirements.
- **`generateStaticParams` cutoff:** Start at top-500 by install count. Validate actual build time on Vercel in Phase 2 and adjust the cutoff if needed.

---

## Sources

### Primary (HIGH confidence)
- Next.js ISR docs (Context7 /vercel/next.js) — `revalidateTag`, `generateStaticParams`, rendering model
- Neon docs (Context7) — Neon + Drizzle + Next.js integration, HTTP driver
- Vercel docs (WebFetch, 2026-05-24) — Cron pricing, WAF plan limits, KV deprecation notice
- Homebrew live API (WebFetch, 2026-05-24) — `formulae.brew.sh/api/cask.json` (7,659 casks), analytics shape and count format
- GitHub REST API docs (WebFetch) — rate limits (5,000/hr PAT), secondary rate limit behavior
- Upstash docs (Context7) — `@upstash/ratelimit` HTTP-based serverless rate limiting
- shadcn/ui docs (Context7) — component availability, Tailwind v4 compatibility
- npm registry (WebFetch, 2026-05-24) — package versions

### Secondary (MEDIUM confidence)
- DuckDuckGo favicon service — widely used in community projects; not officially documented as a production API
- Fuse.js performance benchmarks — extrapolated from 10K item tests to 7,659 cask scenario
- LLM classification cost estimate — extrapolated from GPT-4o-mini pricing; actual cost depends on prompt length and category schema

### Tertiary (informational)
- formulae.brew.sh live scrape — confirmed absence of search, categories, icons
- AlternativeTo and Mac App Store live scrape — confirmed table-stakes expectations
- macapps.link — prior art for bundle generator; confirmed unmaintained

---

*Research completed: 2026-05-24*
*Ready for roadmap: yes*
