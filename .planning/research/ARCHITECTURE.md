# Architecture Research: BrewIndex

**Researched:** 2026-05-24
**Confidence:** HIGH (all findings verified against live APIs and current Next.js/Vercel docs)

---

## System Components

```
External Sources
  formulae.brew.sh/api/cask.json          (15.5 MB, ~7,659 casks, max-age=600)
  formulae.brew.sh/api/analytics/...      (349 KB each, 30d / 90d / 365d)
  api.github.com/repos/{owner}/{repo}     (REST, 5,000 req/hr with PAT)

        |  Vercel Cron (daily)
        v
  [Sync Job — /app/api/cron/sync/route.ts]
        |  fetches all three Homebrew endpoints + GitHub batch queries
        v
  [Neon Postgres (via Vercel Marketplace)]
    tables: casks, analytics_snapshots, github_stats
        |
        |  read-only queries from Next.js pages
        v
  [Next.js App Router — Vercel]
    /                    → ISR, revalidate=3600, static HTML
    /browse              → ISR, revalidate=3600, paginated card grid
    /cask/[token]        → ISR + generateStaticParams, revalidate=3600
    /search              → dynamic (SSR), query param driven
    /api/search          → Route Handler, dynamic, rate-limited
    /api/cron/sync       → Route Handler, POST, cron-secret protected
        |
        v
  [Vercel Edge Network]
    - DDoS mitigation (automatic, all plans)
    - WAF custom rules (rate limiting on /api/* by IP)
    - CDN cache serves ISR pages; backend rarely hit
```

**Data flow summary:** Cron job pulls Homebrew + GitHub data into Postgres once per day. Next.js pages read from Postgres at build/revalidation time, not per user request. Vercel's edge CDN absorbs all user traffic. Only search queries and the cron endpoint reach live compute.

---

## Homebrew API Details

**Confirmed against live endpoints on 2026-05-24.**

### Endpoints

| Endpoint | Size | Cache-Control | Purpose |
|----------|------|---------------|---------|
| `GET https://formulae.brew.sh/api/cask.json` | 15.5 MB | max-age=600 | Full catalog, all 7,659 casks |
| `GET https://formulae.brew.sh/api/cask/{token}.json` | ~few KB | max-age=600 | Single cask detail |
| `GET https://formulae.brew.sh/api/analytics/cask-install/homebrew-cask/30d.json` | 349 KB | max-age=600 | Install counts, last 30 days |
| `GET https://formulae.brew.sh/api/analytics/cask-install/homebrew-cask/90d.json` | ~350 KB | max-age=600 | Install counts, last 90 days |
| `GET https://formulae.brew.sh/api/analytics/cask-install/homebrew-cask/365d.json` | ~350 KB | max-age=600 | Install counts, last 365 days |

No authentication required. No documented rate limits, but the Cache-Control: max-age=600 means the data refreshes at most every 10 minutes upstream. The `last-modified` header shows Homebrew publishes a fresh snapshot roughly once per day.

### Cask Data Shape (key fields)

```typescript
interface BrewhomeCask {
  token: string              // slug, e.g. "visual-studio-code"
  full_token: string         // same as token for homebrew/cask tap
  name: string[]             // display names, e.g. ["Microsoft Visual Studio Code", "VS Code"]
  desc: string               // one-line description
  homepage: string           // upstream project URL
  url: string                // download URL (arm64 default)
  version: string            // current version string
  sha256: string             // download checksum
  artifacts: ArtifactSpec[]  // app installs, binaries, uninstall, zap
  depends_on: {              // dependency declarations
    macos?: Record<string, string[]>  // min macOS version
    cask?: string[]
    formula?: string[]
  }
  conflicts_with: { cask?: string[] } | null
  caveats: string | null     // post-install notes shown to user
  deprecated: boolean
  disabled: boolean
  auto_updates: boolean | null
  languages: string[]
  variations: Record<string, {  // per-macOS-version overrides (url, sha256)
    url: string
    sha256: string
  }>
  tap_git_head: string       // commit hash of homebrew-cask repo at time of publish
  ruby_source_path: string   // path within repo, e.g. "Casks/v/visual-studio-code.rb"
}
```

### Analytics Data Shape

```typescript
interface AnalyticsResponse {
  category: "cask_install"
  total_items: number        // 7,763 as of 2026-05-24
  start_date: string         // ISO date
  end_date: string           // ISO date
  total_count: number        // sum of all installs in window
  formulae: Record<string, [{ cask: string; count: string }]>
  // count is a locale-formatted string: "17,498" — must strip commas before parseInt
}
```

**Important:** `count` values are locale-formatted strings with commas (`"17,498"`), not integers. Strip commas before parsing.

### Refresh Cadence

The Homebrew API publishes a fresh snapshot approximately once per day (confirmed via `last-modified` headers). The `max-age=600` edge cache means callers see data that is at most 10 minutes stale at the CDN layer. A daily sync job is sufficient; more frequent polling wastes bandwidth for a 15.5 MB file.

---

## GitHub API Integration

### What data is available

Via `GET /repos/{owner}/{repo}` (REST) the response includes:
- `stargazers_count` — star count
- `forks_count` — fork count
- `open_issues_count` — open issue count
- `description`, `language`, `topics`
- `updated_at` — last push timestamp
- `license.spdx_id`

### GitHub URL extraction

Of 7,659 casks:
- **54.7% (~4,189)** have an extractable GitHub `{owner}/{repo}` path in either `homepage` or `url`
- **14.1% (~1,078)** have `github.com` as their explicit homepage domain
- **39.3% (~2,253)** use GitHub releases as the download URL

Font packs (Google Fonts) account for ~1,933 casks whose homepage points to `fonts.google.com`, not GitHub. Exclude `token`s that start with a known font-pack prefix, or filter by `tap == "homebrew/cask"` only.

### Recommended approach: REST with batched daily sync

**Do not use GraphQL for this.** The data needed (stars, forks, issues) is trivially available via REST. GraphQL batching across unrelated repositories requires aliased queries with one alias per repo — this adds significant query complexity for no benefit over parallelised REST calls.

With a GitHub PAT (Personal Access Token):
- Rate limit: 5,000 requests/hour
- 4,189 repos / 5,000 req/hr = **under 1 hour** for a full sync, even serial
- With modest concurrency (10 parallel requests), a full sync completes in ~7 minutes

**Pattern:**

```typescript
// lib/github.ts
const GITHUB_TOKEN = process.env.GITHUB_TOKEN // server-only
const BASE = "https://api.github.com"

async function fetchRepoStats(owner: string, repo: string) {
  const res = await fetch(`${BASE}/repos/${owner}/${repo}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      Accept: "application/vnd.github+json",
    },
    next: { revalidate: 0 }, // called from cron, never cache in Next.js
  })
  // respect rate limit headers
  const remaining = parseInt(res.headers.get("x-ratelimit-remaining") ?? "5000")
  if (remaining < 100) {
    const reset = parseInt(res.headers.get("x-ratelimit-reset") ?? "0")
    await sleepUntil(reset * 1000)
  }
  if (res.status === 404) return null  // repo moved/deleted
  if (!res.ok) throw new Error(`GitHub ${res.status}: ${owner}/${repo}`)
  return res.json()
}
```

**Caching strategy for GitHub stats:** Store results in Postgres with a `github_synced_at` timestamp. Only re-fetch repos where `github_synced_at` is older than 24 hours. This means most repos are skipped on subsequent cron runs, staying well within rate limits even as the catalog grows.

**No GitHub App needed.** A single PAT with `public_repo` read scope is sufficient for read-only public repo data. Store as `GITHUB_TOKEN` environment variable on Vercel.

---

## Data Sync Strategy

### Recommended: Vercel Cron + Neon Postgres

**Pattern:** One daily cron job at `/api/cron/sync` fetches all Homebrew data and stale GitHub stats, writes to Postgres, then calls `revalidateTag('casks')` to bust the Next.js ISR cache.

```json
// vercel.json
{
  "crons": [
    { "path": "/api/cron/sync", "schedule": "0 6 * * *" }
  ]
}
```

This runs at 06:00 UTC daily. On Vercel Pro, cron precision is per-minute (well within daily). On Hobby, daily crons are supported (once per day limit applies but once daily is all that is needed).

**Why not on-demand revalidation / webhooks?**

Homebrew does not publish webhooks for cask updates. The `formulae.brew.sh` API does not emit events. The only viable trigger is polling. Given Homebrew publishes roughly once daily, a daily cron is perfectly aligned. On-demand revalidation via `revalidateTag` is used *after* the cron job completes, not as the trigger mechanism.

**Why not time-based ISR revalidation pointing directly at Homebrew?**

With 7,659 casks each having ISR revalidation fire independently, that is up to 7,659 outbound fetches to `formulae.brew.sh` per revalidation cycle — distributed across every user's first post-expiry visit. This hammers the upstream API, produces stale data for users who happen to hit between revalidations, and makes the site's data freshness unpredictable. The cron-writes-to-Postgres pattern gives a single controlled sync window.

**Sync job outline:**

```
1. Fetch formulae.brew.sh/api/cask.json           → upsert all casks
2. Fetch analytics 30d, 90d, 365d                 → upsert analytics_snapshots
3. Query DB for casks where github_synced_at < NOW - 24h
4. Batch-fetch GitHub stats with concurrency=10
5. Upsert github_stats
6. Call revalidateTag('casks') to invalidate ISR cache
7. Log sync summary (casks updated, errors, duration)
```

**Cron endpoint protection:** Vercel sets `user-agent: vercel-cron/1.0` on cron-triggered requests, but this header is spoofable. Use a shared secret:

```typescript
// app/api/cron/sync/route.ts
export async function GET(req: Request) {
  const authHeader = req.headers.get("Authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 })
  }
  // ... sync logic
}
```

Set `CRON_SECRET` as a Vercel environment variable (auto-provided as `CRON_SECRET` by Vercel when using `vercel.json` crons).

---

## Next.js Page Architecture

### Route Structure

```
app/
  layout.tsx                     # root layout, ThemeProvider, nav
  page.tsx                       # / — home, featured + trending casks
  browse/
    page.tsx                     # /browse — paginated grid, category filters
    loading.tsx                  # Suspense boundary for grid
  cask/
    [token]/
      page.tsx                   # /cask/visual-studio-code — detail page
      loading.tsx
  search/
    page.tsx                     # /search?q=... — SSR, query-driven
  api/
    cron/
      sync/
        route.ts                 # GET — daily sync job, cron-protected
    search/
      route.ts                   # GET /api/search?q=... — rate-limited
    cask/
      [token]/
        route.ts                 # GET — JSON for a single cask (optional)
```

### Rendering strategy per page

| Route | Strategy | Rationale |
|-------|----------|-----------|
| `/` (home) | ISR, `revalidate=3600` | Static HTML, served from CDN. Cask data changes once daily; 1h revalidation is conservative. |
| `/browse` | ISR, `revalidate=3600`, with `generateStaticParams` for first N pages | Grid is static content. Pagination can use query params without breaking static caching — first 10 pages pre-generated, rest rendered on-demand with ISR. |
| `/cask/[token]` | ISR + `generateStaticParams`, `revalidate=3600` | 7,659 pages pre-generated at build. Each page is pure static HTML until daily revalidation fires. Cold starts never hit Postgres per-user. `dynamicParams=true` (default) handles any new cask token not in the build. |
| `/search` | SSR (dynamic), `dynamic='force-dynamic'` | Query changes per request. Cannot be statically pre-built. Reads from Postgres via full-text search. |
| `/api/search` | Route Handler, dynamic | Powers client-side instant search. Apply rate limiting middleware. |
| `/api/cron/sync` | Route Handler, dynamic, secret-gated | Never cached, runs backend sync. |

### Why ISR at revalidate=3600 rather than longer?

The Homebrew data refreshes daily, but build-time pre-generation gives all 7,659 pages on deploy. The `revalidate=3600` only matters for pages that were not pre-generated (new casks) or after a cache invalidation from `revalidateTag`. In practice, most pages are served from the build snapshot for the entire day, then the daily cron calls `revalidateTag('casks')` which marks all tagged pages stale. The hour-long revalidation is a safety net, not the primary freshness mechanism.

### generateStaticParams for detail pages

```typescript
// app/cask/[token]/page.tsx
export const revalidate = 3600

export async function generateStaticParams() {
  const casks = await db.select({ token: caskTable.token }).from(caskTable)
  return casks.map((c) => ({ token: c.token }))
}
```

At 7,659 casks this generates 7,659 static pages at build time. Next.js handles this without special configuration — it is the documented pattern for large catalogs (the ISR docs use this exact approach). Build time will be dominated by Postgres query time (~1-2 seconds) plus parallel static rendering. Expected full build: under 3 minutes on Vercel.

### Search architecture

Two-tier:
1. **`/api/search?q=`** — server-side full-text search against Postgres `tsvector` index on cask `name`, `desc`, `token`. Returns JSON. Rate-limited by IP at the Vercel WAF layer.
2. **`/search?q=`** — SSR page that calls the internal data layer (not the API route) directly, renders results server-side for SEO and initial load.

Do not implement client-side search over a downloaded JSON blob. The full catalog is 15.5 MB uncompressed — too large to ship to browsers. Postgres full-text search is fast enough for sub-100ms responses at this scale.

### Security layer

```
Internet → Vercel Edge Network
  Layer 1: DDoS mitigation (automatic, all plans, no config)
  Layer 2: WAF custom rule — rate limit /api/* to N req/min per IP
  Layer 3: /api/cron/sync checks Authorization header (CRON_SECRET)
  Layer 4: ISR cache absorbs 99%+ of page requests before they reach compute
```

All API routes return proper HTTP status codes (429 for rate limit, 401 for auth failures). No mutating endpoints are exposed without auth.

---

## Build Order

Recommended sequence for fastest working prototype to production-ready:

**Step 1 — Data foundation (day 1-2)**
Build the sync job first. Without real data, nothing else can be tested meaningfully.
- `lib/db/schema.ts` — Drizzle schema for `casks`, `analytics_snapshots`, `github_stats`
- `lib/sync/homebrew.ts` — fetch + parse cask.json and analytics endpoints
- `app/api/cron/sync/route.ts` — trigger endpoint, test with `curl`
- Run sync once manually, confirm 7,659 rows in Postgres

**Step 2 — Browse page (day 2-3)**
The browse grid is the product. A working browse page with real data proves the stack end-to-end.
- `app/browse/page.tsx` — ISR, paginated cask grid (no styling needed yet)
- `lib/data/casks.ts` — `getCasks(page, limit)` Postgres query with analytics join
- Confirm ISR works: build, deploy, see static HTML

**Step 3 — Detail page (day 3-4)**
Second-highest value. Install command copy is the core action.
- `app/cask/[token]/page.tsx` — ISR with `generateStaticParams`
- `brew install --cask {token}` copy button (Client Component)
- Show: name, desc, version, install count, homepage link

**Step 4 — Search (day 4-5)**
- Add `tsvector` column + GIN index to `casks` table (migration)
- `app/api/search/route.ts` — full-text search endpoint
- `app/search/page.tsx` — SSR results page
- Rate limiting on search endpoint

**Step 5 — GitHub stats (day 5-6)**
- `lib/sync/github.ts` — batched fetch with rate limit handling
- Wire into daily cron
- Display on detail page: stars, forks, open issues

**Step 6 — Home page (day 6-7)**
Can be last because it's curated content derived from already-working components.
- Featured casks (hand-picked or top-30d-installs query)
- Trending section
- ISR page composition

**Why this order:** Data sync must exist before any page can show real content. Browse page validates the full ISR stack. Detail page is the highest-value interaction (the install command). Search is needed but complex — deferred until data model is proven. GitHub stats are enrichment, not core. Home page is last because it aggregates everything else.

---

## Key Architectural Decisions and Rationale

| Decision | Choice | Why |
|----------|--------|-----|
| Cache store | Neon Postgres | Vercel KV was deprecated Dec 2024. Postgres gives structured queries needed for full-text search, pagination, sorting by analytics. Neon is the official Vercel Marketplace recommendation. |
| Sync trigger | Vercel Cron (daily) | Homebrew publishes ~daily. No webhook available. Cron is the only viable pattern. |
| ISR invalidation | `revalidateTag('casks')` after cron | Explicit invalidation post-sync beats timed stale-while-revalidate for a catalog that changes once daily. |
| GitHub API | REST PAT, not GraphQL | Simpler, sufficient for the data shape needed. 4,189 repos / 5,000 req/hr = safe. |
| Search | Postgres full-text | 15.5 MB JSON is too large for client-side. Postgres tsvector GIN index gives sub-100ms at this scale. |
| `generateStaticParams` for 7,659 casks | Yes, pre-generate all | ISR docs confirm this is the intended pattern. All pages are CDN-cached after first build. No cold starts per user. |

---

## Open Questions / Flags for Later Phases

- **Icon/screenshot sourcing:** Homebrew cask data has no icon URL field. Icons need to be sourced separately (Macaw API, app icon extraction from DMGs, or a third-party service like Clearbit Logos for homepage domains). This is a significant enrichment problem deferred to a later phase.
- **Neon free tier limits:** Neon free tier is 0.5 GB storage and limited compute hours. At 7,659 casks with analytics and GitHub stats, the DB will likely be 20-50 MB — well within free tier. Monitor as data grows.
- **Build time at scale:** `generateStaticParams` returning 7,659 params means 7,659 static pages are rendered per build. Monitor build duration on Vercel; if it exceeds 45 minutes, consider pre-generating only top-N casks by install count and letting the rest be ISR on-demand.
- **Homebrew API stability:** `formulae.brew.sh` is operated by the Homebrew project. No SLA is documented. The sync job must handle outages gracefully (keep serving stale Postgres data, log but don't crash).
