# Stack Research: BrewIndex

**Project:** BrewIndex — App Store-like catalog for Homebrew casks
**Researched:** 2026-05-24
**Research Mode:** Ecosystem

---

## Recommended Stack

| Layer | Choice | Version | Rationale |
|-------|--------|---------|-----------|
| Framework | Next.js App Router | 16.x (current) | Mandated by project. ISR, Server Components, and API routes all in one. `generateStaticParams` pre-renders top cask pages; `revalidate` keeps them fresh without cold starts. |
| Language | TypeScript | 5.x | Mandated. Drizzle + Zod + Octokit are all typed end-to-end. |
| Styling | Tailwind CSS | v4.3 | Stable production release (confirmed current). CSS-first config; no `tailwind.config.js`. Works with shadcn/ui. |
| Component library | shadcn/ui | 3.5+ (CLI-installed) | Best fit for an App Store-like UI. Copy-paste model means no version lock. Ships Card, Grid, Badge, Dialog, Command palette out of the box. Built on Radix UI for a11y. Designed for Tailwind v4. |
| Icon system | lucide-react + shadcn/ui | 1.16.0 | UI chrome icons. For cask app icons, see Icon Handling section below. |
| Database | Neon (serverless Postgres) | @neondatabase/serverless 1.1.0 | Serverless HTTP driver eliminates TCP connection exhaustion on Vercel. Free tier (0.5 GB, 100 CU-hr/mo) handles a 17k-cask catalog comfortably. Integrates with Drizzle via `drizzle-orm/neon-http`. Postgres full-text search is available when needed. |
| ORM | Drizzle ORM | 0.45.x | TypeScript-first, lightweight. Best-in-class Neon integration (`drizzle-orm/neon-http`). Migration via `drizzle-kit push` for dev, `drizzle-kit migrate` for production. No runtime overhead. |
| Validation | Zod | 4.4.x | Schema validation for API route inputs, Homebrew API response shapes, and GitHub API responses. Used with Drizzle for type-safe inserts. |
| Rate limiting | @upstash/ratelimit | 2.0.8 | HTTP-based, runs in Vercel Edge Middleware and API routes with no TCP connections. Sliding-window and fixed-window algorithms. Backed by Upstash Redis free tier (500K commands/mo). The de-facto standard for Next.js rate limiting. |
| Redis (rate limit backing) | Upstash Redis | @upstash/redis via integration | Free tier: 500K commands/mo, 256 MB storage. Sufficient for rate limiting + a small hot-cache layer. Vercel KV was deprecated in December 2024 and migrated users to Upstash directly. |
| Search | Fuse.js (client-side) | 7.3.0 | 17,236 casks is within Fuse.js's practical range when the index is pre-built server-side and shipped as JSON. `Fuse.createIndex()` pre-computation eliminates the 1-2s indexing hit in the browser. Simpler ops than Algolia or Typesense; no external service dependency. Revisit if search quality is insufficient (see Pitfalls). |
| Data sync (cron) | Vercel Cron Jobs + Next.js Route Handler | built-in | Vercel Cron is free on all plans. **Pro plan required** for sub-daily sync (Hobby plan: once/day max). Recommended schedule: every 6 hours (`0 */6 * * *`). Each run hits the Homebrew JSON API and upserts into Neon. |
| GitHub API client | @octokit/rest + @octokit/plugin-throttling | 21.x | Fetches repo stars/forks/issues for casks with a GitHub homepage. Throttling plugin handles 5,000 req/hr limit for authenticated tokens automatically. A GitHub App token is preferred over a PAT for higher limits (up to 15K req/hr on Enterprise orgs). Unauthenticated: 60 req/hr — not viable. |
| Cask icon handling | Favicon fallback chain | — | No icon fields exist in the Homebrew cask JSON or API. Homebrew's own website uses Algolia-indexed content without icons. Strategy: (1) favicon fetched via `https://icon.horse/icon/<domain>` or `https://icons.duckduckgo.com/ip3/<domain>.ico` using the cask's `homepage` URL domain; (2) generated placeholder using the cask name's initials as an SVG with a consistent color derived from the name hash. DuckDuckGo's favicon service is free, no API key required, and reliable for well-known app domains. |
| Image optimization | next/image | built-in | Handles resizing and WebP conversion for any icon URLs that are external. Configure `remotePatterns` for icon.horse and duckduckgo.com domains. Use `placeholder="blur"` with a generated 8×8 blurDataURL for perceived performance. |
| Deployment | Vercel | — | Mandated. ISR, Edge Middleware for rate limiting, Cron Jobs, and native Upstash + Neon marketplace integrations. |
| Security middleware | Vercel WAF (custom rules) + @upstash/ratelimit in Edge Middleware | — | Two-layer defense: WAF at the CDN edge (up to 40 custom rules on Pro) for IP blocking and bot rules; Upstash ratelimit in Next.js Edge Middleware for per-IP request throttling on API routes. WAF managed rulesets require Enterprise. Pro plan is sufficient for this project's threat model. |

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Database | Neon (Postgres) | **Turso (SQLite/libSQL)** | Turso's `@libsql/client/web` works on Vercel edge/serverless, but SQLite has no native full-text search comparable to Postgres `tsvector`, and the ecosystem around Drizzle + Turso is less mature than Drizzle + Neon. Neon wins for catalog-style read-heavy workloads with filtering. |
| Database | Neon (Postgres) | **Upstash Redis as primary store** | Redis is key-value; modeling 17K casks with filtering/sorting/FTS requires JSON scan anti-patterns or secondary indexes that are complex to maintain. Use Redis for caching only, not primary store. |
| Database | Neon (Postgres) | **PlanetScale (MySQL)** | PlanetScale dropped its free tier in 2024. MySQL lacks `tsvector` / full-text search quality of Postgres. Not worth the cost for this scale. |
| Redis/KV | Upstash Redis (direct) | **Vercel KV** | Vercel KV was deprecated December 2024 and auto-migrated users to Upstash. Do not use `@vercel/kv` — it is marked deprecated in the npm registry. Use `@upstash/redis` directly. |
| Search | Fuse.js | **Algolia** | Algolia provides high-quality search but adds operational cost ($0+ per 1K search ops), a third-party SLA dependency, and requires an index sync pipeline. For 17K records with simple name/description matching, Fuse.js is sufficient at zero cost. |
| Search | Fuse.js | **Typesense (self-hosted)** | Typesense offers excellent search quality and a self-hosted option but requires running a separate server (not Vercel-native). Typesense Cloud adds cost. Overkill for MVP. |
| Search | Fuse.js | **Postgres full-text search** | A viable upgrade path: Postgres `tsvector` with `GIN` index supports prefix matching, ranking, and multilingual tokenization. Defer to a later milestone if Fuse.js quality proves insufficient; the schema change is straightforward. |
| Component library | shadcn/ui | **Material UI (MUI)** | MUI's design language is strongly "Android-Material" — does not produce an App Store-like visual feel. Heavier bundle, theming is complex. |
| Component library | shadcn/ui | **Radix UI primitives directly** | Radix provides the accessibility layer but no styled components. shadcn/ui is Radix + Tailwind pre-composed; building the same from raw Radix takes significantly more time. |
| Component library | shadcn/ui | **Chakra UI** | Chakra v3 improved but still opinionated about visual design in ways that conflict with a custom App Store aesthetic. shadcn/ui's copy-paste model makes it easier to deviate from defaults. |
| Rate limiting | @upstash/ratelimit | **next-rate-limit / express-rate-limit** | These use in-memory stores which are stateless across Vercel serverless function instances — rate limit state is per-instance and provides no real protection. Upstash Redis provides the shared state required for distributed rate limiting. |
| GitHub API | @octokit/rest | **Raw fetch calls** | `@octokit/plugin-throttling` provides automatic retry-after handling for both primary (5K/hr) and secondary (abuse) rate limits. Manual implementation is error-prone. |

---

## Key Constraints & Gotchas

### 1. Cask Dataset Size
The Homebrew analytics API returns **17,236 unique casks** (confirmed from `analytics/cask-install/365d.json` metadata field `total_items`). The full cask list (`/api/cask.json`) is too large to read in a single Vercel function execution without streaming — it causes timeout and memory issues. The sync cron job must paginate or stream the response, or fetch individual cask JSON files in batches with concurrency limits.

### 2. No Icon Field in Homebrew API
Confirmed by inspecting both the cask JSON API (`visual-studio-code.json`) and the `.rb` cask definition: there are **zero icon/image fields** anywhere in the Homebrew cask format. The Homebrew website itself does not show icons. The icon fallback strategy (favicon from `homepage` domain) must be built and will have gaps for casks without a `homepage` or with a homepage on a domain without a quality favicon.

### 3. Vercel KV is Dead
`@vercel/kv` is deprecated and must not be used in new projects. The npm package itself is marked `"deprecated"`. Redis on Vercel is now exclusively via Marketplace integrations — the Upstash integration injects `KV_URL`, `KV_REST_API_URL`, and `KV_REST_API_TOKEN` into the environment, and you use `@upstash/redis` directly.

### 4. Cron Job Frequency Requires Pro Plan
Homebrew releases new casks and updates versions continuously. A once-per-day sync (Hobby limit) means stale data for up to 24 hours. **Vercel Pro plan is required** to run the sync cron job every 6 hours. Pro also provides up to 40 WAF custom rules (vs 3 on Hobby), which is needed for meaningful bot/rate-limit rules.

### 5. GitHub API Rate Limits Need Architecture Thought
With 17K casks, many linking to GitHub repos, naively fetching GitHub stats during the sync cron would exhaust the 5K req/hr limit. The sync must be incremental: only re-fetch GitHub stats for casks updated since the last sync, or stagger GitHub API calls across multiple cron runs using a `last_github_sync_at` column in Neon.

### 6. Tailwind CSS v4 Breaking Changes
Tailwind v4 (stable, current) removes `tailwind.config.js` in favor of CSS-based configuration (`@import "tailwindcss"; @theme { ... }`). shadcn/ui's current CLI generates v4-compatible components. Do not follow v3 tutorials. The PostCSS plugin is replaced by `@tailwindcss/vite` for Next.js (via the PostCSS plugin `@tailwindcss/postcss` for non-Vite builds).

### 7. Fuse.js Index Size
A Fuse.js index for 17K casks with `name`, `desc`, and `token` fields will be approximately 3–6 MB as a serialized JSON string. This should be fetched once and cached in memory or in a Service Worker. Pre-build the index server-side using `Fuse.createIndex()` and serialize it — do not rebuild in the browser. Serve the pre-built index from a Next.js API route or as a static JSON file in `/public`.

### 8. Neon Scale-to-Zero Cold Start
Neon's free tier scales to zero after 5 minutes of inactivity. The cold start to first query can be 1–3 seconds. For the ISR-heavy architecture, most page loads never hit Neon (they serve cached HTML). But the sync cron job and API routes that do hit Neon should expect occasional cold-start latency. Using the HTTP-based `neon()` driver (not `Pool`) avoids TCP connection limits during cold starts.

### 9. Vercel WAF: Managed Rulesets Require Enterprise
The Vercel WAF Custom Rules (up to 40 on Pro) cover IP blocking and custom logic. However, **Managed Rulesets** (pre-built OWASP rules, bot detection) require Enterprise. For DDoS/bot protection at Pro tier, rely on Cloudflare as an upstream proxy, or use Vercel's custom rules combined with Upstash rate limiting in Edge Middleware.

### 10. ISR and generateStaticParams for 17K Pages
Pre-rendering all 17K cask detail pages at build time is impractical (build time > 10 minutes, large static output). Use `generateStaticParams` only for the top N casks by install count (e.g., top 500), and set `dynamicParams = true` so the rest are rendered on first request and cached via ISR. Set `revalidate = 3600` (1 hour) at the page level.

---

## Installation Reference

```bash
# Core framework (already scaffolded)
npx create-next-app@latest --typescript --tailwind --app

# Database + ORM
npm install drizzle-orm @neondatabase/serverless
npm install -D drizzle-kit

# Validation
npm install zod

# Rate limiting
npm install @upstash/ratelimit @upstash/redis

# GitHub API
npm install @octokit/rest @octokit/plugin-throttling

# Search
npm install fuse.js

# Image placeholders
npm install plaiceholder sharp

# UI components (shadcn/ui is CLI-installed, not npm-installed)
npx shadcn@latest init
npx shadcn@latest add card badge button command dialog input

# UI utilities
npm install lucide-react class-variance-authority clsx tailwind-merge

# Tailwind v4 for Next.js (PostCSS approach)
npm install -D @tailwindcss/postcss
```

---

## Confidence Levels

| Area | Confidence | Basis |
|------|------------|-------|
| Next.js ISR / App Router patterns | HIGH | Official Next.js docs (Context7 /vercel/next.js), confirmed current as of v16.2.6 |
| Neon as database choice | HIGH | Official Neon docs confirming Next.js + Drizzle integration pattern; free tier limits confirmed from pricing page |
| Drizzle ORM for Neon | HIGH | Official Drizzle docs (Context7) show `drizzle-orm/neon-http` pattern; tutorial exists for exact stack |
| @upstash/ratelimit | HIGH | npm v2.0.8 confirmed; official docs confirmed HTTP-based, serverless-native; Vercel KV deprecation confirmed from Vercel docs |
| shadcn/ui for component library | HIGH | Context7 source, actively maintained, v3.5+ confirmed, Tailwind v4 compatible |
| Tailwind CSS v4 stability | HIGH | Official docs confirm v4.3 is current stable production release |
| Fuse.js for search | MEDIUM | Appropriate for 17K record dataset with pre-built index; performance at this scale is extrapolated from Fuse.js docs benchmarks (10K items tested). Quality may require upgrade. |
| Icon fallback strategy | MEDIUM | No official icon source exists (confirmed). DuckDuckGo favicon service is widely used as a fallback in community projects; not officially documented as a production service — reliability is assumed, not guaranteed. |
| GitHub API rate limit strategy | MEDIUM | Rate limits confirmed from official GitHub docs (5K/hr authenticated). Incremental sync strategy is a design recommendation, not a tested implementation. |
| Vercel Cron Jobs | HIGH | Official Vercel docs confirmed: Hobby = once/day, Pro = per-minute. Cron jobs included in all plans. |
| Vercel WAF limits | HIGH | Official Vercel WAF docs confirmed plan limits (3/40/1000 custom rules for Hobby/Pro/Enterprise). |

---

## Sources

- Next.js ISR: https://github.com/vercel/next.js/blob/canary/docs/01-app/02-guides/incremental-static-regeneration.mdx (Context7)
- Neon Next.js guide: https://neon.com/docs/guides/nextjs (Context7)
- Neon pricing: https://neon.com/pricing (WebFetch, confirmed 2026-05-24)
- Drizzle + Neon tutorial: https://github.com/drizzle-team/drizzle-orm-docs (Context7)
- @upstash/ratelimit: https://upstash.com/docs/redis/sdks/ratelimit-ts/overview (Context7)
- Upstash pricing: https://upstash.com/pricing (WebFetch, confirmed 2026-05-24)
- Vercel Redis / KV deprecation: https://vercel.com/docs/redis (WebFetch, last updated 2026-01-13)
- Vercel WAF: https://vercel.com/docs/vercel-firewall/vercel-waf (WebFetch, last updated 2026-02-27)
- Vercel Cron Jobs: https://vercel.com/docs/cron-jobs/usage-and-pricing (WebFetch, last updated 2026-03-04)
- Homebrew API structure: https://formulae.brew.sh/docs/api/ (WebFetch)
- Homebrew Analytics (cask count): https://formulae.brew.sh/api/analytics/cask-install/365d.json (WebFetch, 17,236 total_items confirmed)
- GitHub API rate limits: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api (WebFetch)
- Octokit throttling plugin: https://github.com/octokit/rest.js (Context7)
- Fuse.js performance: https://www.fusejs.io/performance.html (Context7)
- Tailwind v4 stability: https://tailwindcss.com/docs/installation (WebFetch, confirmed v4.3 stable)
- shadcn/ui: https://ui.shadcn.com (Context7)
- npm versions confirmed via registry.npmjs.org queries (2026-05-24)
