# BrewIndex

An App Store-like web UI for discovering Homebrew casks — macOS GUI applications installable via `brew install --cask`. Built for newcomers who want to find and understand apps available through Homebrew without ever needing to touch the command line.

> **Core value:** A newcomer can discover, understand, and install any macOS app available via Homebrew without ever needing to know the CLI exists.

---

## What It Does

- **Browse ~17,000 Homebrew casks** sorted by popularity (365-day install count)
- **Visual card grid** with app icons, descriptions, and install stats
- **Detail pages** per cask — version, homepage, GitHub stars/forks/issues, and a one-click copy for the install command
- **Top 500 pages pre-rendered** at build time via `generateStaticParams`; all others served via ISR
- **Daily data sync** from the official Homebrew JSON API, GitHub API, and DuckDuckGo favicon service

---

## Architecture

BrewIndex is a monorepo with two services: a Next.js frontend deployed to Vercel, and a Hono backend deployed to Railway.

```
brewindex/
├── src/                    # Next.js App Router (frontend + API routes)
│   ├── app/                # Routes: /, /browse, /cask/[token], /api/*
│   ├── components/         # UI components (CaskCard, CaskGrid, Pagination, etc.)
│   ├── db/                 # Drizzle schema, migrations, DB client
│   └── lib/                # Shared utilities (Homebrew client, GitHub client, icons, queries)
├── backend/                # Railway service
│   ├── src/
│   │   ├── server.ts       # Hono HTTP server (port 3000)
│   │   ├── routes/sync.ts  # POST /sync — runs the full data pipeline
│   │   └── lib/logger.ts   # Structured JSON wide-event logger
│   └── trigger/cron.ts     # Railway cron entrypoint (calls POST /sync, exits)
├── scripts/                # DB seed scripts
├── Dockerfile              # Railway container image (node:22-slim)
└── railway.toml            # Railway deploy config
```

### Data flow

```
Railway Cron (every 6h)
  → POST /sync (Hono backend, Railway)
      → Homebrew JSON API         — fetch ~17K cask catalog
      → Homebrew Analytics API    — 30/90/365d install counts
      → DuckDuckGo favicon API    — fetch icon per cask homepage domain
      → Vercel Blob               — store icon, record url in DB
      → GitHub API (Octokit)      — stars/forks/issues for ~1,083 GitHub-hosted casks
      → PostgreSQL (Railway)      — upsert all rows
      → Vercel revalidation hook  — invalidate ISR cache

User request (Vercel CDN)
  → Next.js page (ISR)
      → PostgreSQL (Railway)      — read casks (cached via unstable_cache)
```

### Why two services?

The original design used Vercel Functions for the sync job, but Vercel's 300s max execution limit is tight for a full pipeline (catalog fetch + 17K DB upserts + icon pipeline + ~1K GitHub API calls takes ~5–8 min). Railway runs the backend as a persistent container with no execution time cap, using its own cron scheduler to trigger the job on a 6-hour cycle.

---

## Tech Stack

| Layer | Technology | Version | Notes |
|-------|-----------|---------|-------|
| Frontend framework | [Next.js](https://nextjs.org) App Router | 16.2.6 | ISR, Server Components, API routes |
| Language | TypeScript | 5.x | End-to-end typed via Drizzle + Zod |
| Styling | [Tailwind CSS](https://tailwindcss.com) | v4.3 | CSS-first config (no `tailwind.config.js`) |
| Components | [shadcn/ui](https://ui.shadcn.com) | 4.8.0 | Copy-paste Radix UI + Tailwind components |
| Icons | [lucide-react](https://lucide.dev) | 1.16.0 | UI chrome icons |
| Database | PostgreSQL (Railway) | 18.x | Single `casks` table, ~17K rows |
| ORM | [Drizzle ORM](https://orm.drizzle.team) | 0.45.2 | `drizzle-orm/node-postgres` driver |
| Backend | [Hono](https://hono.dev) + `@hono/node-server` | 4.12.23 / 2.0.4 | Lightweight HTTP server on Railway |
| Cask data | [Homebrew JSON API](https://formulae.brew.sh/docs/api/) | — | `formulae.brew.sh/api/cask.json` |
| Icon source | [DuckDuckGo favicon service](https://icons.duckduckgo.com/ip3) | — | `icons.duckduckgo.com/ip3/<domain>.ico` |
| Image storage | [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) | 2.4.0 | Stores fetched icons; public access |
| GitHub enrichment | [Octokit](https://github.com/octokit/rest.js) + throttling | 22.0.1 / 11.0.3 | Stars, forks, open issues per cask |
| Validation | [Zod](https://zod.dev) | 4.4.3 | API response shapes, route inputs |
| Deployment — frontend | [Vercel](https://vercel.com) | — | ISR, CDN, image optimisation |
| Deployment — backend | [Railway](https://railway.com) | — | Container + cron scheduler |

---

## Database Schema

Single `casks` table in PostgreSQL:

```sql
id             serial PRIMARY KEY
token          text UNIQUE NOT NULL        -- cask identifier, e.g. "visual-studio-code"
name           text NOT NULL               -- display name, e.g. "Visual Studio Code"
description    text                        -- short description from Homebrew
version        text                        -- latest version string
homepage       text                        -- upstream project URL
icon_url       text                        -- cached icon URL (Vercel Blob)
icon_is_fallback boolean DEFAULT false     -- true = initials avatar used, not a real icon
install_30d    integer                     -- installs in last 30 days (Homebrew Analytics)
install_90d    integer                     -- installs in last 90 days
install_365d   integer                     -- installs in last 365 days
github_stars   integer                     -- upstream GitHub repo stars
github_forks   integer                     -- upstream GitHub repo forks
github_issues  integer                     -- open issues on upstream GitHub repo
github_enriched boolean DEFAULT false      -- true = GitHub stats have been fetched
is_active      boolean DEFAULT true        -- false = cask no longer in Homebrew registry
last_synced_at timestamp DEFAULT now()     -- last successful sync timestamp
```

---

## Local Development

### Prerequisites

- Node.js 22+
- A PostgreSQL database (local or [Railway](https://railway.com) / [Neon](https://neon.tech) free tier)
- A [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) store (for icon storage)
- A [GitHub personal access token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) (for GitHub enrichment)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Create .env.local with required vars (see Environment Variables below)

# 3. Push schema to your database
npx drizzle-kit push

# 4. (Optional) Seed with initial data
npm run seed

# 5. Start the Next.js dev server
npm run dev
```

Open `http://localhost:3000` — you'll be redirected to `/browse`.

To run the backend sync service locally:

```bash
# In a separate terminal
npx tsx backend/src/server.ts

# Trigger a sync manually
curl -X POST http://localhost:3000/sync \
  -H "Authorization: Bearer <your-CRON_SECRET>"
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob read/write token |
| `GITHUB_TOKEN` | Yes | GitHub PAT for Octokit API calls (5K req/hr authenticated) |
| `CRON_SECRET` | Yes | Bearer token for `/sync` endpoint auth |
| `VERCEL_REVALIDATE_URL` | Yes (backend) | URL of the `/api/revalidate` Next.js route |
| `BACKEND_INTERNAL_URL` | Yes (cron) | Internal Railway URL of the Hono backend |

---

## Deployment

### Frontend — Vercel

Connect the repo to a Vercel project. Set the environment variables above. Next.js builds automatically on push; ISR handles cache invalidation after each sync.

Image `remotePatterns` are configured in `next.config.ts` for `icons.duckduckgo.com`, `icon.horse`, and `*.public.blob.vercel-storage.com`.

### Backend — Railway

The `Dockerfile` at the repo root builds the Railway service. `railway.toml` sets the health check path to `/health`.

Two Railway services are needed:
1. **brewindex** — the Hono HTTP server (`npx tsx backend/src/server.ts`)
2. **brewsync** — the cron trigger (`npx tsx backend/trigger/cron.ts`), scheduled every 6 hours (`0 */6 * * *`)

Required Railway environment variables: all five listed above, plus `BACKEND_INTERNAL_URL` set to the internal Railway URL of the `brewindex` service.

---

## Data Sources & Attribution

| Source | What we use | Terms |
|--------|-------------|-------|
| [Homebrew](https://brew.sh) — `formulae.brew.sh/api/cask.json` | Full cask catalog: token, name, description, version, homepage | [BSD 2-Clause](https://github.com/Homebrew/brew/blob/master/LICENSE.txt). Homebrew is a registered trademark of its contributors. |
| [Homebrew Analytics API](https://formulae.brew.sh/docs/api/) — `formulae.brew.sh/api/analytics/cask-install/` | Install counts (30/90/365-day) | Same as above. Analytics data is aggregated and anonymised by Homebrew. |
| [GitHub REST API](https://docs.github.com/en/rest) | Stars, forks, open issue counts for casks with GitHub homepages | [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service). Data fetched via authenticated Octokit client; only public repository metadata. |
| [DuckDuckGo favicon service](https://icons.duckduckgo.com/ip3) — `icons.duckduckgo.com/ip3/<domain>.ico` | App icons fetched from cask homepage domains | Not an officially documented production API. Used as a best-effort icon source; icons are stored in Vercel Blob and served from there — the DuckDuckGo service is only hit during sync, not on every user request. |

BrewIndex is not affiliated with, endorsed by, or sponsored by Homebrew, GitHub, or DuckDuckGo.

---

## How This Was Built — AI-Assisted Development

BrewIndex was built with heavy AI assistance using **Claude Code** (Anthropic's CLI coding agent) and the **GSD Redux** workflow system.

### GSD Redux

GSD Redux is a structured AI-driven development workflow. It enforces a `discuss → plan → execute → verify` loop for every feature, where:

- **Discuss** — requirements and constraints are explored before any code is written
- **Plan** — a `PLAN.md` is generated per feature with task-level breakdown, threat model, and verification criteria
- **Execute** — Claude Code executes the plan atomically, one task at a time, with commits per task
- **Verify** — a verifier agent checks whether the phase goal was actually achieved, not just whether tasks completed

All planning artifacts live in `.planning/` (roadmap, phase plans, state, requirements). The workflow is tracked in `.planning/STATE.md`.

### What Claude Code did

- Designed the full data pipeline architecture (Homebrew sync, icon pipeline, GitHub enrichment)
- Selected and validated the tech stack against official documentation and npm registry data
- Wrote all production code across 5 phases
- Performed code review (security, correctness, API contract validation)
- Diagnosed and fixed production bugs (Homebrew Analytics API schema mismatch, Railway cron timeout, Docker startup)
- Added structured logging following the wide-event pattern

### What was human-directed

- Product vision and core value statement
- Decision to migrate from Vercel Functions to Railway (execution time constraints)
- Design direction (App Store aesthetic, sketch-first process)
- Approval of each phase plan before execution

### AI tool usage transparency

All code in this repository was written by Claude Code (Anthropic's `claude-sonnet-4-6` / `claude-opus-4-7` models) under human supervision. Every commit was reviewed before merge. No AI-generated code was merged without the author reading and understanding it.

---

## Project Status

| Phase | Focus | Status |
|-------|-------|--------|
| 1 — Data Pipeline | Homebrew sync, icon pipeline, GitHub enrichment, SSRF protection | ✅ Complete |
| 2 — Catalog UI | Browse grid, cask detail pages, ISR, top-500 pre-render | ✅ Complete |
| 3 — Search & Security | Fuse.js search, platform filter, rate limiting, Vercel WAF | Planned |
| 4 — Discovery Layer | Category filter, trending sort, GitHub stats on cards | Planned |
| 5 — Railway Migration | Backend move to Railway, persistent cron, structured logging | ✅ Complete |

---

## License

MIT — see [LICENSE](LICENSE).

Homebrew cask data is sourced from the Homebrew project under the BSD 2-Clause License.
GitHub data is sourced from the GitHub REST API under GitHub's Terms of Service.
App icons are sourced via the DuckDuckGo favicon service and are the property of their respective trademark holders.
