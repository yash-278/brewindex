# BrewIndex

## What This Is

BrewIndex is a modern, App Store-like web UI for discovering Homebrew casks (macOS GUI applications). It gives both newcomers and experienced developers a polished way to browse, search, and understand what's available in the Homebrew cask registry — something that doesn't exist today beyond the raw Homebrew website.

## Core Value

A newcomer can discover, understand, and install any macOS app available via Homebrew without ever needing to know the CLI exists.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can browse all Homebrew casks in a visual grid/card layout
- [ ] User can search casks by name
- [ ] User can view a detail page for a cask with description, version, stats, and dependencies
- [ ] User can copy or see the `brew install --cask <name>` command in one click
- [ ] User can see install count / popularity ranking
- [ ] User can see version and update history for a cask
- [ ] User can see GitHub stars, forks, and issues for the upstream repo
- [ ] User can see the dependency graph for a cask
- [ ] Cask data is synced from the Homebrew JSON API into a cache layer (not fetched live per request)
- [ ] UI design is validated via 2-3 sketch variations before build begins

### Out of Scope

- Formulae (CLI tools) — deferred to a later milestone; casks first
- User accounts / auth for end users — read-only public catalog, no login required
- Real-time Homebrew data — cache layer is acceptable, not a live mirror
- Mobile app — web-first

## Context

- Homebrew exposes a public JSON API at `formulae.brew.sh/api` — cask data and analytics are available without authentication
- Homebrew Analytics API provides install counts (30d, 90d, 365d) per formula/cask
- Casks represent macOS GUI apps (e.g., VSCode, Figma, Notion) — they have icons, homepage URLs, and bottle/artifact links
- Most casks link to a GitHub upstream repo, enabling star/fork/issue data via GitHub API
- No existing project fills this niche well — the official Homebrew site is functional but not discovery-oriented

## Constraints

- **Tech Stack**: Next.js (App Router) + TypeScript — full-stack in one repo
- **Deployment**: Vercel — ISR/static pages wherever possible to minimize compute cost
- **Security**: Multi-layered DDoS/abuse protection is a first-class requirement, not an afterthought
  - Vercel Firewall / WAF rules at the edge
  - Rate limiting on all API routes
  - Cache-heavy ISR architecture so the backend is rarely hit directly
  - Auth-gated writes (any mutating or privileged endpoints require auth)
- **Design Process**: 2-3 page sketch variations generated before any production UI is built; design system derived from the chosen variation

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Casks only in v1 | Richer icons + more recognizable apps; formulae can be added later | — Pending |
| Next.js full-stack | One repo, API routes for backend logic, ISR for caching, easy Vercel deploy | — Pending |
| Backend cache layer | Avoid rate-limiting from Homebrew API on every user request; enables fast search | — Pending |
| Sketch-first design | Validate visual direction before committing to a component library or design tokens | — Pending |
| Security as a constraint | AI-assisted build risks introducing vulns; multi-layer protection chosen upfront | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-24 after initialization*
