# BrewIndex

## What This Is

BrewIndex is a modern, App Store-like web UI for discovering Homebrew casks (macOS GUI applications). It gives both newcomers and experienced developers a polished way to browse, search, and understand what's available in the Homebrew cask registry — something that doesn't exist today beyond the raw Homebrew website.

v1.0 shipped a complete working catalog: 7,659+ casks browsable in a dark Raycast-inspired grid, full-text search, category filters, sort controls, per-cask detail pages with install command copy, GitHub social proof, and production infrastructure running on Railway + Tigris S3.

## Core Value

A newcomer can discover, understand, and install any macOS app available via Homebrew without ever needing to know the CLI exists.

## Current State (v1.0)

- **Status:** Shipped — live on Vercel + Railway
- **Stack:** Next.js App Router + TypeScript + Drizzle + Railway Postgres + Tigris S3 + shadcn/ui + Tailwind v4
- **Infrastructure:** Vercel (frontend/ISR) + Railway (backend Hono server, cron, Postgres) + Tigris (icon CDN)
- **Catalog:** ~7,659 casks, synced every 6 hours via Railway cron
- **LOC:** ~3,200 TypeScript (src + backend)
- **Known gap:** Pagination does not preserve filter/sort state across pages (BRWS-02, BRWS-03, BRWS-04)

## Requirements

### Validated

- ✓ Cask data is synced from the Homebrew JSON API into Postgres (not fetched live) — *v1.0: Phase 1 + Phase 5*
- ✓ User can see install count / popularity ranking — *v1.0: Phase 1 (analytics ingested) + Phase 2 (stat cards)*
- ✓ User can see GitHub stars, forks, and issues for the upstream repo — *v1.0: Phase 1 (enrichment) + Phase 4 (GitHubStatsCard)*
- ✓ User can browse all Homebrew casks in a visual grid/card layout — *v1.0: Phase 2 (CaskCard, CaskGrid)*
- ✓ User can search casks by name — *v1.0: Phase 3 (tsvector + SearchInput)*
- ✓ User can view a detail page for a cask with description, version, stats, and install command — *v1.0: Phase 2 (CaskPage)*
- ✓ User can copy the `brew install --cask <name>` command in one click — *v1.0: Phase 2 (CopyButton)*
- ✓ User can filter casks by category — *v1.0: Phase 4 (CategoryFilter, Bedrock ML categorization) — partial: filter breaks on pagination*
- ✓ User can sort the browse grid by popularity, alphabetically, or most recently updated — *v1.0: Phase 4 (SortDropdown) — partial: sort breaks on pagination*
- ✓ UI design validated via sketch variations before build — *v1.0: 2 sketch sessions (browse grid + detail page), Raycast-inspired dark theme chosen*
- ✓ Cron endpoint secured by CRON_SECRET bearer auth — *v1.0: Phase 1 + Phase 5*
- ✓ Server-side fetches restricted to SSRF allowlist — *v1.0: Phase 1 (21-entry RFC 1918 block)*

### Active

- [ ] **Pagination preserves filter/sort state** — clicking to page 2 loses category/sort URL params (known v1.0 gap)
- [ ] User can see the dependency graph for a cask
- [ ] Version and update history for a cask
- [ ] All public API routes rate-limited (Upstash ratelimit in package.json, deferred from v1.0)

### Out of Scope

- Formulae (CLI tools) — deferred to a later milestone; casks first
- User accounts / auth for end users — read-only public catalog, no login required
- Real-time Homebrew data — cache layer is acceptable, not a live mirror
- Mobile app — web-first; responsive web is sufficient
- Platform filter (SRCH-02) — no platform data in schema; requires schema backfill
- Vercel WAF managed rules (SECU-02) — requires Enterprise plan

## Context

- Homebrew exposes a public JSON API at `formulae.brew.sh/api` — cask data and analytics are available without authentication
- Homebrew Analytics API provides install counts (30d, 90d, 365d) per formula/cask
- Casks represent macOS GUI apps (e.g., VSCode, Figma, Notion) — they have icons, homepage URLs, and bottle/artifact links
- Most casks link to a GitHub upstream repo, enabling star/fork/issue data via GitHub API
- No existing project fills this niche well — the official Homebrew site is functional but not discovery-oriented
- v1.0 moved off Neon + Vercel Cron to Railway ($5/mo total) with Tigris S3 for icon storage (no per-operation quota)
- ML categorization run via AWS Bedrock Nova Micro (~$0.14 for full 7,659-cask catalog); categories stored in DB

## Constraints

- **Tech Stack**: Next.js App Router + TypeScript + Drizzle — full-stack in one repo
- **Deployment**: Vercel (frontend) + Railway (backend/Postgres/cron) — minimize compute cost via ISR
- **Security**: Multi-layered protection as a first-class requirement
  - CRON_SECRET on all mutating/sync endpoints
  - SSRF allowlist with full RFC 1918 block on all server-side fetches
  - Cache-heavy ISR architecture so the backend is rarely hit directly
  - Rate limiting deferred (Upstash package present, SECU-01 out of scope for v1.0)
- **Design Process**: Sketch-first — Raycast-inspired dark theme validated before component build

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Casks only in v1 | Richer icons + more recognizable apps; formulae can be added later | ✓ Good — catalog is rich and immediately recognizable |
| Next.js full-stack | One repo, RSC + ISR for caching, easy Vercel deploy | ✓ Good — no performance issues; ISR cache working well |
| Backend cache layer (Postgres) | Avoid rate-limiting from Homebrew API on every user request; enables fast search | ✓ Good — sub-100ms queries in production |
| Sketch-first design | Validate visual direction before committing to a component library or design tokens | ✓ Good — Raycast-inspired dark theme chosen after 2 sessions; no design rework during build |
| Security as a constraint | AI-assisted build risks introducing vulns; multi-layer protection chosen upfront | ✓ Good — SSRF protection caught RFC 1918 gap before production |
| Railway migration (Phase 5) | Neon + Vercel Cron cost vs Railway $5/mo hobby tier | ✓ Good — single Railway project covers Postgres + backend + cron |
| Tigris S3 for icons (Phase 5.1) | Vercel Blob per-operation quota hit during full sync runs | ✓ Good — no quota issues; icons on CDN reliably |
| AWS Nova Micro for categorization | ~200x cheaper than Claude Haiku for single-label classification | ✓ Good — $0.14 total; no quality tradeoff for fixed 10-category taxonomy |
| Pagination state gap accepted at v1.0 | Pagination component from Phase 2 not updated when Phase 4 added filters | ⚠️ Revisit — known gap; pagination breaks filter/sort on page 2+ |

---
*Last updated: 2026-06-08 after v1.0 milestone — full MVP shipped, 6 phases complete, production live on Railway + Vercel*
