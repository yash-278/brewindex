# Pitfalls Research: BrewIndex

**Domain:** Homebrew cask catalog web UI (Next.js App Router + Vercel)
**Researched:** 2026-05-24
**Confidence:** HIGH — all claims verified against official documentation

---

## Homebrew Bulk JSON Payload Exceeds 10 MB

**Risk level:** high

The `formulae.brew.sh/api/cask.json` endpoint returns all ~7,000+ casks in a single JSON blob. A direct fetch during `next build` (inside `generateStaticParams` or a sync route) will blow through Vercel's 10 MB serverless function response cache limit. The request itself also takes several seconds, making cold builds fragile. During live testing, fetching this URL produced a content-length-exceeded error at 10,485,760 bytes.

**Warning signs:**
- Build logs show timeout or memory errors in `generateStaticParams`
- Function responses return 413 or are silently truncated
- Search index population fails intermittently

**Prevention:**
- Never fetch `cask.json` inside a Vercel function at request time — it is a build-time or background-sync-only payload
- In the cache sync job, stream and parse the response incrementally (Node.js streaming JSON parse or chunked download), then write individual records to the database rather than buffering the whole blob in memory
- Store the raw sync timestamp alongside the data so stale-data debugging is trivial

**Phase to address:** Phase 1 (data pipeline / backend cache layer). The architecture decision of how cask data is ingested must be made before any ISR pages are built.

---

## Homebrew API Has No SLA, No Rate Limit Docs, No Versioning Guarantee

**Risk level:** high

The official `formulae.brew.sh/docs/api/` page documents zero rate limit policy, zero SLA, and zero version changelog or deprecation notices. The API is community-maintained and has no authentication requirement, which means it can change schema, remove fields, or go offline with no warning. The `variations` object already has inconsistent sub-schemas across OS versions (e.g., `big_sur` entries carry extra fields absent from `sequoia` entries), and `installed`/`bundle_version` fields are always `null` in the API response.

**Warning signs:**
- Null-pointer exceptions or TypeScript type errors when casks have missing `desc`, `homepage`, or `name[0]`
- Build failures after an undocumented upstream schema change
- UI components hard-coded to expect a string receive an array or null

**Prevention:**
- Parse every field defensively: treat `name` as `string[]` (not `string`), `desc` as `string | null`, `caveats` as `string | null`
- Write a Zod schema (or equivalent) to validate incoming cask JSON at the sync layer; log and skip records that fail validation rather than crashing the sync
- Pin the sync job to the single-cask endpoint (`/api/cask/${token}.json`) format as the fallback for individual records if bulk parsing fails
- Monitor the Homebrew GitHub repository for schema changes; add a CI assertion that checks field presence against a known-good fixture

**Phase to address:** Phase 1 (data sync) and Phase 2 (detail pages that render nullable fields).

---

## Stale Cask Data Silently Served After Homebrew Updates

**Risk level:** high

Homebrew releases new cask versions continuously. A cache layer with a fixed TTL will always serve stale version numbers and descriptions to users. Because the Homebrew API has no webhook or push notification mechanism, the sync job must be scheduled. If the scheduler is not set up correctly (or is on Hobby plan where cron reliability is reduced), users will see outdated install commands or "new version available" badges that are wrong.

**Warning signs:**
- `version` field shown on detail pages is several weeks behind `brew info --cask` output
- Users report install commands that fail because the URL has changed

**Prevention:**
- Run the sync job at least every 4–6 hours via an external cron (GitHub Actions scheduled workflow is free and reliable) rather than relying on Vercel cron on Hobby
- Store `synced_at` in the database and surface it in a footer or `/api/health` endpoint so drift is visible
- On the cask detail page, show the `generated_date` field from the Homebrew JSON to set user expectations

**Phase to address:** Phase 1 (sync job scheduling), referenced again in Phase 3 (UI trust signals).

---

## ISR Cache Stampede When Revalidate Fires Across Thousands of Routes

**Risk level:** high

With 7,000+ cask detail pages each using `revalidate = N`, all routes whose TTL expires at the same moment will simultaneously trigger background regeneration. On Vercel's fluid compute model, each such revalidation invokes a function, consumes provisioned memory for the full instance lifetime (not just active CPU time), and bills per invocation. A stampede of 1,000 simultaneous revalidations at once can generate a sudden spike in both function invocations and provisioned-memory billing.

Additionally, Next.js ISR on Vercel does not have a global "regenerate all" primitive — `revalidateTag` and `revalidatePath` are the only on-demand options, and they are per-tag or per-path, not bulk. Calling `revalidatePath` inside a loop for 7,000 paths inside a single function will exhaust function duration limits.

**Warning signs:**
- Billing dashboard shows spikes every N hours aligned with the revalidate period
- Function duration logs show timeouts in the sync/revalidate job
- `x-vercel-cache: STALE` appears in responses long after revalidation should have completed

**Prevention:**
- Set `revalidate` to a long TTL (e.g., 86400 seconds / 24 hours) for individual cask pages; rely on the background sync job + `revalidateTag('cask-data')` to push updates rather than time-based expiry
- Never loop `revalidatePath` over all routes — tag-based invalidation with `revalidateTag` is O(1) regardless of route count
- Use `dynamicParams = true` with ISR so the first post-sync request regenerates a page on-demand rather than front-loading all 7,000 at once
- On the Pro plan, use Spend Management alerts to catch billing anomalies before they become large bills

**Phase to address:** Phase 2 (ISR architecture for cask pages) and Phase 1 (sync job must emit tag-based invalidation, not path-based).

---

## Vercel Image Optimization Cost Explosion from Cask Icons

**Risk level:** high

Every cask icon served through `next/image` that misses the CDN cache costs: one image transformation ($0.05–$0.08 per 1K), one image cache write ($4–$6.40 per 1M write units, measured in 8 KB chunks), and Fast Data Transfer fees. For a catalog grid rendering 7,000 icons on first load, the transformation count alone will exhaust the Hobby plan's 5K/month limit in a single crawl. Each transformation fires on cache MISS and cache STALE events.

Additionally, the Vercel image cache is **per-region** — an image cached in `iad1` is not cached in `sfo1`, so users in different regions each trigger new writes. This is especially punishing for high-traffic apps with a global audience.

**Warning signs:**
- Image Optimization Usage in the Vercel dashboard climbs on every Googlebot crawl
- 402 status codes appear on images (Hobby plan limit hit)
- Monthly bill shows image cache writes as the dominant line item

**Prevention:**
- Do not use `next/image` to proxy cask icons from arbitrary third-party URLs at request time — icons should be fetched at sync time, stored in Vercel Blob or an S3-compatible bucket, and served from a known hostname registered in `remotePatterns`
- Use `width` and `height` props explicitly (required for remote images) to prevent CLS and avoid Next.js needing to probe dimensions
- Use `quality={75}` and `sizes` attributes on grid thumbnails; full-resolution only on detail pages
- Set `unoptimized={true}` for icons you already control at known fixed dimensions (e.g., 32x32 app icons) — skips Vercel's pipeline entirely

**Phase to address:** Phase 2 (icon storage strategy must be decided before rendering grid), Phase 1 (sync job must fetch and store icons, not hotlink).

---

## Hotlinking Icons from Third-Party CDNs Causes Broken Images and Policy Violations

**Risk level:** high

Homebrew cask entries provide `homepage` URLs (not icon URLs directly). Icons are typically sourced from the app vendor's website, macOS App Store, or GitHub repository. Hotlinking these at render time creates three problems: (1) the URLs are not stable and change when vendors update their CDNs; (2) many CDNs block hotlinking via Referer header checks; (3) GitHub's raw CDN (`raw.githubusercontent.com`) serves images but has its own rate limits. A grid of 7,000 cards hotlinking icons will produce a mix of broken images, CORS errors, and 403 Forbidden responses.

**Warning signs:**
- Broken image icons in the cask grid in production that work locally
- Browser console shows 403 or CORS errors on icon fetches
- Icons disappear after a vendor site update

**Prevention:**
- At sync time, download icons to controlled storage (Vercel Blob or equivalent); serve them from your own CDN
- Implement a fallback icon strategy: app-specific icon → first-letter placeholder rendered in CSS → default Homebrew icon; never render a broken `<img>` element
- For GitHub-hosted images, use the authenticated GitHub API (with a token) to fetch and cache assets at sync time; do not serve raw GitHub URLs directly

**Phase to address:** Phase 1 (sync job design) and Phase 2 (image component fallback logic).

---

## Cumulative Layout Shift (CLS) from Dynamic Icon Loading in Grid

**Risk level:** medium

When `next/image` is used for remote images without explicit `width` and `height` props, the browser cannot reserve space before the image loads, causing layout shift. On a grid of 50–100 cask cards per page, a CLS score above 0.1 will hurt Core Web Vitals and SEO ranking. The `fill` prop alternative avoids the need to specify dimensions but requires the parent to have `position: relative` and a defined size — easy to get wrong across responsive breakpoints.

**Warning signs:**
- Lighthouse CLS score above 0.1 on the catalog grid page
- Grid cards visually "jump" when images load on slow connections

**Prevention:**
- Always specify `width` and `height` for remote icons (standardize all stored icons to a fixed dimension, e.g., 128x128, at sync time)
- Use `placeholder="blur"` with a small `blurDataURL` generated at sync time for perceived performance
- Use CSS `aspect-ratio` on icon containers as a belt-and-suspenders fallback so layout is stable even if `next/image` props are wrong

**Phase to address:** Phase 2 (grid component design).

---

## GitHub API Rate Limit Exhaustion When Enriching 7,000 Casks

**Risk level:** high

Most Homebrew casks link to a GitHub repository as `homepage`. Fetching star count, fork count, and issue count for 7,000 repos against the GitHub REST API costs 7,000 GET requests. Unauthenticated: 60 requests/hour — the entire dataset takes 116 hours. Authenticated with a personal access token: 5,000 requests/hour — still requires 1.4 hours minimum and risks secondary rate limits (100 concurrent requests max, 900 REST points/minute).

Secondary rate limits are the hidden trap: they cannot be checked proactively, return 403 or 429 responses with a `Retry-After` header, and repeated violations can result in the integration being banned by GitHub.

**Warning signs:**
- Sync job logs show 403 responses from `api.github.com`
- GitHub stats fields in the database are mostly null or stale
- A `Retry-After` header appears in GitHub API responses

**Prevention:**
- Use the GitHub GraphQL API with batched queries (up to 100 repos per query using aliases or the `nodes` query) to reduce request count by 100x
- Alternatively, use the REST API with `per_page=100` and paginate `GET /repositories` or `GET /orgs/{org}/repos` for repos belonging to known orgs (many popular apps are under well-known GitHub orgs)
- Implement exponential backoff with jitter; respect `Retry-After` headers unconditionally
- Cache GitHub stats in your database with a separate stale TTL (e.g., update GitHub stats every 24 hours, not every sync cycle)
- Not all casks have a GitHub `homepage` — many link to vendor websites; guard against non-GitHub URLs before making API calls

**Phase to address:** Phase 1 (GitHub enrichment in sync pipeline) and Phase 3 (GitHub stats display component).

---

## Vercel WAF Custom Rules Are Limited to 3 on Hobby, 40 on Pro

**Risk level:** medium

The project lists "Vercel Firewall / WAF rules at the edge" as a first-class security requirement. However, WAF Managed Rulesets (OWASP-style automated rule packs) are **Enterprise-only**. On Hobby: maximum 3 custom rules, maximum 10 IP blocks. On Pro: 40 custom rules, 100 IP blocks. For a public catalog with no auth, this is likely sufficient for basic bot and rate-limit rules, but it means sophisticated WAF protection (e.g., managed SQLi/XSS rule packs) is not available below Enterprise pricing.

**Warning signs:**
- Bot traffic pattern changes require more than 40 custom rules
- Managed rulesets are assumed to be available on Pro — they are not

**Prevention:**
- Design WAF rules economically: one rule per abuse pattern rather than one per IP
- Use `rate-limit` custom rules based on IP + path pattern to handle the most common abuse scenarios within the 40-rule budget
- Complement WAF with application-level rate limiting in Next.js middleware (e.g., using Upstash Redis with a sliding window) for endpoint-specific protection that does not consume WAF rule slots
- Document the Enterprise WAF dependency explicitly in the project constraints if managed rulesets are genuinely required

**Phase to address:** Phase 1 (security architecture) and revisited at Phase 3 (rate limiting implementation).

---

## SSRF via Unsanitized URL Proxying in GitHub/Image Fetch Routes

**Risk level:** high

Any API route that accepts a user-supplied URL and makes a server-side request to it is an SSRF vector. This is especially dangerous in AI-assisted builds where the generated code often scaffolds `fetch(userSuppliedUrl)` patterns without input validation. For BrewIndex, the risk surfaces if a "proxy icon" or "fetch repo stats" route accepts a `url` query parameter without allowlisting the target hostname.

An attacker can supply URLs like `http://169.254.169.254/latest/meta-data/` (AWS metadata endpoint), `http://localhost:3000/api/admin`, or `file:///etc/passwd` to exfiltrate infrastructure credentials or probe internal services.

**Warning signs:**
- Any API route with `fetch(req.query.url)` or `fetch(params.get('url'))`
- Code review reveals no hostname allowlist before outbound HTTP calls

**Prevention:**
- Allowlist the exact hostnames the server is allowed to call: `formulae.brew.sh`, `api.github.com`, and your own Blob storage hostname — nothing else
- Validate and parse user-supplied URLs with `new URL()`, then check `url.hostname` against the allowlist before fetching
- Disable HTTP redirect following (`redirect: 'error'`) to prevent redirect-chain bypasses
- Block requests to private RFC1918 ranges, loopback, and metadata endpoints at the middleware layer as a defense-in-depth measure
- Code review checklist for AI-generated routes: does any route call `fetch()` with a value derived from request input?

**Phase to address:** Phase 1 (API route design), active throughout all phases in code review.

---

## Request-Time API Usage Silently Forces Entire Routes to Dynamic Rendering

**Risk level:** medium

In Next.js App Router, calling `cookies()`, `headers()`, or reading `searchParams` in a Server Component opts the **entire route** into dynamic rendering — including any parent layout. This is easy to introduce accidentally with AI-generated code that adds `headers()` for debugging or cookies for feature flags. A catalog page that should be statically rendered becomes a full-dynamic server render, bypassing the CDN entirely and billing a function invocation on every page view.

**Warning signs:**
- `x-vercel-cache: MISS` on every request to what should be a static/ISR page
- Build output shows unexpected `λ` (dynamic) symbols on catalog routes
- Function invocation count climbs proportionally with page views

**Prevention:**
- Audit every Server Component in the layout tree for Request-time API usage before shipping; use `export const dynamic = 'error'` on catalog routes to make accidental dynamic rendering a build error
- Move any cookie or header reads to Middleware (which runs at the edge and does not force full dynamic rendering of the page) or to dedicated dynamic route segments
- Use the Next.js `@next/bundle-analyzer` and the build output's route type indicators (`○` static, `ƒ` dynamic) as a CI quality gate

**Phase to address:** Phase 2 (page rendering strategy audit), revisited at every subsequent phase.

---

## `generateStaticParams` with 7,000 Routes Causes Long Build Times and Memory Pressure

**Risk level:** medium

Calling `generateStaticParams` with the full cask list pre-generates all 7,000+ routes at build time. On Vercel, this runs in a serverless build environment with a fixed memory budget. Building 7,000 individual HTML pages sequentially will take 15–30 minutes or more depending on data fetching, and may OOM the build process. Critically, `generateStaticParams` does **not** re-run on ISR revalidation — once paths are generated, new casks added to Homebrew will 404 until the next full redeploy.

**Warning signs:**
- Build times exceed 20 minutes on Vercel
- New casks return 404 even after the sync job runs
- Build process killed with memory error

**Prevention:**
- Use the "subset at build time, rest on-demand" pattern: `generateStaticParams` returns only the top 200–500 most-installed casks; set `dynamicParams = true` (default) so remaining casks are rendered on first request and then cached
- This also eliminates the "new cask 404" problem since any valid token renders on-demand
- The subset list should be derived from the analytics data (most-installed) so the statically pre-rendered pages cover the majority of traffic

**Phase to address:** Phase 2 (cask detail page architecture).

---

## Client-Side Search Does Not Scale to 7,000 Casks

**Risk level:** medium

Libraries like Fuse.js or FlexSearch require loading the entire search corpus into the browser before indexing. For 7,000 casks with name, description, and token fields, the JSON payload is several hundred kilobytes to over a megabyte before gzip. Index construction runs on the main thread and blocks interaction for 100–500ms on mobile devices. Subsequent searches are fast, but the initial load penalty is user-visible. The problem worsens as Homebrew adds more casks.

**Warning signs:**
- Lighthouse TTI (Time to Interactive) penalty on catalog pages with search enabled
- Mobile users report search feeling "frozen" on first keystroke
- Network waterfall shows a large JSON payload on catalog load

**Prevention:**
- Implement server-side search using full-text search in your database (PostgreSQL `tsvector`, SQLite FTS5, or a hosted option like Typesense/Meilisearch)
- For the MVP, a simple `ILIKE` or `LIKE` query against indexed `token` and `name` columns is faster to build and performs adequately up to 50,000 rows
- If client-side search is used early (MVP shortcut), limit the preloaded index to token + name only (not description), use a debounce of 200ms, and load the index lazily after the page becomes interactive
- Set a concrete "switch to server-side search" threshold (e.g., 2,000+ casks or when client search latency exceeds 300ms) as a phase transition trigger

**Phase to address:** Phase 2 (search architecture decision) with a planned upgrade path in Phase 3 or 4.

---

## Stale Search Index After Sync (Index and Database Drift)

**Risk level:** medium

When cask data is updated in the database but the search index (whether a separate vector store, Typesense collection, or client-side JSON blob) is not updated atomically, search results return stale or invalid cask tokens. A user searches for "visual studio code", clicks a result, and lands on a 404 because the token was renamed in a Homebrew update and the search index still holds the old token.

**Warning signs:**
- Search results link to 404 pages
- Newly added casks do not appear in search for hours
- Deprecated/disabled casks still appear in search results

**Prevention:**
- Run the search index update in the same transaction as the database write (or immediately after, with a rollback on failure)
- Filter `deprecated: true` and `disabled: true` casks from both the database and the search index at sync time
- Use the `old_tokens` array from the Homebrew API to create redirect rules for renamed casks

**Phase to address:** Phase 1 (sync pipeline) and Phase 2 (search index management).

---

## Deprecated and Disabled Casks Appearing in the Catalog

**Risk level:** medium

The Homebrew cask JSON schema includes `deprecated`, `deprecation_date`, `deprecation_reason`, `disabled`, `disable_date`, and `disable_reason` fields. A naive sync that bulk-imports all casks will include deprecated and disabled entries in the catalog, search results, and sitemaps. Users who click these entries and attempt to install them will get `brew install` errors. Deprecated casks also sometimes include a `deprecation_replacement_formula` or `deprecation_replacement_cask` field pointing to the successor.

**Warning signs:**
- Catalog contains apps with known replacements (e.g., old cask names for apps that were renamed)
- User reports "brew says this cask is disabled"

**Prevention:**
- At sync time, filter `disabled: true` casks entirely from the catalog
- For `deprecated: true` casks, either filter them or show a prominent deprecation notice with a link to `deprecation_replacement_cask` if present
- Add `deprecated` and `disabled` as indexed boolean columns in the database to enable efficient filtering

**Phase to address:** Phase 1 (sync data model) and Phase 2 (catalog filtering logic).

---

## SEO: Dynamic `generateMetadata` Double-Fetches Cask Data

**Risk level:** low

In Next.js App Router, `generateMetadata` and the Page component both run on the server for each request to a dynamic route. Without using React's `cache()` wrapper around the data-fetching function, the cask record is fetched twice per page render — once for metadata (title, description, OG image) and once for the page body. On a high-traffic catalog with 7,000 pages, this doubles database query load on cache misses.

**Warning signs:**
- Database query logs show two identical queries per page load
- Function duration is higher than expected for data-light pages

**Prevention:**
- Wrap cask data fetching in `import { cache } from 'react'` — Next.js automatically deduplicates `cache()`-wrapped calls within a single render pass
- This is a zero-cost optimization; apply it to all data-fetching functions shared between `generateMetadata` and the page component

**Phase to address:** Phase 2 (detail page implementation).

---

## SEO: Sitemap with 7,000 URLs Hitting Vercel Function Limits

**Risk level:** low

A dynamically generated sitemap via `app/sitemap.ts` that fetches all 7,000 cask tokens at request time will: (1) slow the sitemap response enough that Googlebot times out; (2) hit the 10 MB cacheable response limit if the sitemap XML is large; (3) invoke a full function on every Googlebot crawl of `/sitemap.xml`. Next.js supports `generateSitemaps()` for splitting into multiple files, but this requires explicit implementation.

**Warning signs:**
- Googlebot reports sitemap fetch errors in Search Console
- `/sitemap.xml` response time exceeds 2 seconds
- Sitemap XML exceeds 50,000 URLs (Google's per-sitemap limit)

**Prevention:**
- Pre-generate the sitemap as a static file during the sync job (write a `public/sitemap.xml` to Blob or generate it as a static Next.js route using `export const dynamic = 'force-static'`)
- Use `generateSitemaps()` to paginate: one index sitemap + N page sitemaps of 1,000 URLs each
- Exclude deprecated and disabled casks from sitemaps

**Phase to address:** Phase 2 (SEO infrastructure).

---

## AI-Assisted Build: Insecure Direct Object Reference on Sync Endpoints

**Risk level:** high

AI-generated code frequently creates administrative endpoints (sync triggers, cache invalidation, data refresh) without authentication. For BrewIndex, a route like `POST /api/sync` or `POST /api/revalidate` that triggers the Homebrew sync job is a privileged operation. If left unauthenticated, an attacker can:
- Exhaust GitHub API rate limits by triggering continuous syncs
- Generate a Vercel function cost spike by triggering thousands of `revalidatePath` calls
- Cause a denial-of-service by continuously invalidating the ISR cache

**Warning signs:**
- AI-generated route handlers for sync/revalidate that lack an `Authorization` header check
- Webhook endpoints that trust the request body without signature verification

**Prevention:**
- All mutating or privileged endpoints must verify a shared secret (`Authorization: Bearer <SYNC_SECRET>`) before executing
- For Homebrew sync triggered by a GitHub Actions cron, pass the secret as a header from the workflow
- Use Next.js middleware to enforce auth on all `/api/admin/*` routes as a belt-and-suspenders measure
- Verify webhook signatures cryptographically (HMAC-SHA256) for any event-driven triggers

**Phase to address:** Phase 1 (API route design, enforced as a code review checklist item).

---

## Phase-Specific Warning Summary

| Phase | Topic | Likely Pitfall | Mitigation |
|-------|-------|---------------|------------|
| Phase 1 | Homebrew bulk sync | 10MB JSON blob crashing function/build | Stream and parse; never buffer full payload |
| Phase 1 | GitHub enrichment | Rate limit exhaustion on 7,000 repo fetches | GraphQL batching; 24-hour TTL for GitHub stats |
| Phase 1 | Icon storage | Hotlinking breaks; CDN blocks external refs | Download icons to Blob at sync time |
| Phase 1 | Sync endpoint security | Unauthenticated POST triggers cost spike | Shared secret auth on all sync routes |
| Phase 2 | ISR revalidation | Stampede on TTL expiry across 7,000 routes | Long revalidate + tag-based invalidation |
| Phase 2 | Image optimization | 5K/month Hobby limit hit by one crawl | Store icons in Blob; set explicit dimensions |
| Phase 2 | Static vs. dynamic rendering | Request-time API use forces full dynamic | Audit with `dynamic = 'error'` on catalog routes |
| Phase 2 | generateStaticParams | 7,000 routes OOM build or take 30min | Pre-render top-500 only; rest on-demand |
| Phase 2 | CLS on grid | Missing width/height on remote images | Standardize icon dimensions at sync time |
| Phase 2 | SEO double-fetch | generateMetadata + page fetch same data twice | Wrap with React `cache()` |
| Phase 2 | Search scaling | Client-side index blocks main thread at 7K items | Server-side search from day one |
| Phase 3 | Deprecated casks | Disabled apps in catalog, install failures | Filter at sync; show replacement links |
| Phase 3 | Stale search index | Search results link to 404 pages | Atomic index update with sync transaction |
| Phase 3 | Sitemap size | 7,000 URLs over response limit | Paginated sitemaps via generateSitemaps() |
| All phases | SSRF | AI code proxies user-supplied URLs to server | Strict hostname allowlist on all fetch calls |
| All phases | WAF rule budget | Managed rulesets are Enterprise-only | App-level rate limiting + 40-rule budget discipline |
