# Walking Skeleton: BrewIndex — Phase 1

**Phase:** 01-data-pipeline
**Created:** 2026-05-24
**Purpose:** Record the architectural decisions that all subsequent phases build on without renegotiating.

---

## What the Skeleton Proves

The thinnest end-to-end path that validates the full stack works:

```
GET /api/cron/sync (Authorization: Bearer CRON_SECRET)
  → safeFetch() allowlist check
  → Homebrew API call (one cask)
  → Drizzle upsert → Neon Postgres
  → 200 { ok: true, synced: 1 }
```

After Plan 01 executes, one cask row exists in Neon. Subsequent plans replace the one-cask stub with the full pipeline.

---

## Framework

| Decision | Value | Rationale |
|----------|-------|-----------|
| Framework | Next.js 16.x App Router | Mandated. ISR + Route Handlers + Cron in one repo. |
| Language | TypeScript 5.x | Mandated. End-to-end types with Drizzle + Zod. |
| Runtime | Node.js 24.x (Vercel) | Current LTS; confirmed available in environment. |

## Database

| Decision | Value | Rationale |
|----------|-------|-----------|
| Provider | Neon (serverless Postgres) | Free tier (0.5 GB) handles 7,659 casks. HTTP driver avoids TCP exhaustion on Vercel. |
| ORM | Drizzle ORM 0.45.x | TypeScript-first; `drizzle-orm/neon-http` integration; batch upserts. |
| Driver | `drizzle-orm/neon-http` | Correct for Vercel serverless. NOT `neon-serverless` (WebSocket — long-lived connections only). |
| Schema style | Single flat `casks` table | D-05: no joins needed for a read-heavy external cache. |
| Conflict resolution | `INSERT ... ON CONFLICT (token) DO UPDATE` | D-07: idempotent, safe for duplicate cron invocations. |
| Soft deletes | `is_active = false` | D-08: prevents ISR page 404s if Homebrew temporarily unpublishes. |
| Migrations | `drizzle-kit push` (dev), `drizzle-kit migrate` (prod) | Push for local dev; generated SQL migrations for production deploys. |

## Auth & Security

| Decision | Value | Rationale |
|----------|-------|-----------|
| Cron auth | `CRON_SECRET` Bearer token, checked FIRST in handler | SECU-03: 401 before any work begins. Generate with `openssl rand -hex 32`. |
| SSRF protection | `safeFetch()` wrapper in `src/lib/fetch-allowlist.ts` | SECU-04: blocks any URL not in `['formulae.brew.sh', 'api.github.com', 'icons.duckduckgo.com', 'icon.horse']`. Redirect chains validated (blocks private IPs). |
| Secrets | Vercel environment variables | DATABASE_URL, CRON_SECRET, GITHUB_TOKEN, BLOB_READ_WRITE_TOKEN. Never logged, never returned in API responses. |

## Data Pipeline

| Decision | Value | Rationale |
|----------|-------|-----------|
| API sources | 4 calls: bulk `cask.json` + `analytics/30d` + `90d` + `365d` | Install counts NOT in bulk payload — must merge from separate analytics endpoints. |
| Install count parsing | `parseInt(raw.replace(/,/g, ''), 10)` | Analytics API returns comma-formatted strings (`"204,909"`). |
| Name extraction | `cask.name[0]` | `name` is `string[]` in Homebrew API. |
| Batch insert size | 500 rows per batch | Individual upserts: 383s. Batched 500/batch: ~5s. |
| Cron schedule | `0 6 * * *` (daily 06:00 UTC) | D-01: once/day. Homebrew publishes once/day; more frequent syncs get stale data. Hobby plan compatible. |
| Function max duration | `export const maxDuration = 800` | Pro plan required. Full sync takes ~10-12 min on first run. |
| Initial seed | `scripts/seed.ts` (local script) | First populate exceeds 800s function limit — run locally against production Neon DB. |

## Icon Storage

| Decision | Value | Rationale |
|----------|-------|-----------|
| Icon source | DuckDuckGo favicon service | `https://icons.duckduckgo.com/ip3/{domain}.ico`. No API key. Free. |
| 404 detection | Check `res.status !== 200` (NOT body length) | DuckDuckGo returns PNG body on BOTH 200 and 404. Body check fails. |
| Storage | Vercel Blob (`@vercel/blob`) | DATA-02: no hotlinking. Blobs served from CDN with public URL. |
| Fallback flag | `icon_is_fallback = true` in DB | Visual CSS initials placeholder rendered in Phase 2 UI. |
| Re-upload guard | Only upload when `icon_url IS NULL` | Avoids re-uploading all 7,659 icons on every daily run. |

## GitHub Enrichment

| Decision | Value | Rationale |
|----------|-------|-----------|
| Scope | ~1,083 casks with `github.com` homepage | D-02 research correction: only 1,083 (not 7,659) need GitHub enrichment. Single pass, no sleep. |
| Auth | PAT with `read:repo` scope (`GITHUB_TOKEN`) | D-03: 5K req/hr authenticated limit. 1,083 requests fits in one pass (~3-5 min). |
| Throttling | `@octokit/plugin-throttling` | Handles primary + secondary rate limits automatically. |
| 404 handling | Log, set `github_enriched = false`, leave stats NULL | D-04: next sync retries automatically. No immediate retry. |
| URL extraction | Regex `/^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/` | Excludes `codeql.github.com`, `docs.github.com`, and `googlefonts` owner. |

## Directory Layout

```
brewindex/
├── src/
│   ├── app/
│   │   └── api/
│   │       └── cron/
│   │           └── sync/
│   │               └── route.ts        # GET handler — CRON_SECRET guard, maxDuration=800
│   ├── db/
│   │   ├── schema.ts                   # Drizzle pgTable definition
│   │   ├── index.ts                    # drizzle(neon(DATABASE_URL)) export
│   │   └── migrations/                 # drizzle-kit generated SQL
│   └── lib/
│       ├── fetch-allowlist.ts          # safeFetch() SSRF wrapper
│       ├── homebrew.ts                 # Homebrew API fetch + field mapping
│       ├── icons.ts                    # DuckDuckGo fetch + Vercel Blob upload
│       └── github.ts                   # Octokit instance + repo stats fetch
├── scripts/
│   └── seed.ts                         # Local initial populate script
├── drizzle.config.ts                   # drizzle-kit config
└── vercel.json                         # Cron job schedule
```

## ISR Cache Contract

The `casks` tag registered in this phase must match exactly what Phase 2 ISR pages declare:

- Sync job calls: `revalidateTag('casks', 'max')` (two-arg form — single-arg deprecated in Next.js 16.x)
- Phase 2 pages must use: `fetch(..., { next: { tags: ['casks'] } })` with the same tag string

## Environment Variables Required

| Variable | Purpose | How to Obtain |
|----------|---------|---------------|
| `DATABASE_URL` | Neon Postgres connection string | Neon dashboard → Connection string (HTTP mode) |
| `CRON_SECRET` | Cron endpoint authentication | Generate: `openssl rand -hex 32` |
| `GITHUB_TOKEN` | GitHub API authenticated access | GitHub Settings → Developer settings → Personal access tokens → `read:repo` scope |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store access | Vercel dashboard → Storage → Blob → Connect to project |

---

*Walking Skeleton created: 2026-05-24*
*Phase 1 plans build on top of these decisions without renegotiating them.*
