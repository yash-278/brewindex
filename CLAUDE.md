<!-- GSD:project-start source:PROJECT.md -->
## Project

**BrewIndex**

BrewIndex is a modern, App Store-like web UI for discovering Homebrew casks (macOS GUI applications). It gives both newcomers and experienced developers a polished way to browse, search, and understand what's available in the Homebrew cask registry — something that doesn't exist today beyond the raw Homebrew website.

**Core Value:** A newcomer can discover, understand, and install any macOS app available via Homebrew without ever needing to know the CLI exists.

### Constraints

- **Tech Stack**: Next.js (App Router) + TypeScript — full-stack in one repo
- **Deployment**: Vercel — ISR/static pages wherever possible to minimize compute cost
- **Security**: Multi-layered DDoS/abuse protection is a first-class requirement, not an afterthought
  - Vercel Firewall / WAF rules at the edge
  - Rate limiting on all API routes
  - Cache-heavy ISR architecture so the backend is rarely hit directly
  - Auth-gated writes (any mutating or privileged endpoints require auth)
- **Design Process**: 2-3 page sketch variations generated before any production UI is built; design system derived from the chosen variation
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

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
## Key Constraints & Gotchas
### 1. Cask Dataset Size
### 2. No Icon Field in Homebrew API
### 3. Vercel KV is Dead
### 4. Cron Job Frequency Requires Pro Plan
### 5. GitHub API Rate Limits Need Architecture Thought
### 6. Tailwind CSS v4 Breaking Changes
### 7. Fuse.js Index Size
### 8. Neon Scale-to-Zero Cold Start
### 9. Vercel WAF: Managed Rulesets Require Enterprise
### 10. ISR and generateStaticParams for 17K Pages
## Installation Reference
# Core framework (already scaffolded)
# Database + ORM
# Validation
# Rate limiting
# GitHub API
# Search
# Image placeholders
# UI components (shadcn/ui is CLI-installed, not npm-installed)
# UI utilities
# Tailwind v4 for Next.js (PostCSS approach)
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
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
