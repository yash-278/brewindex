# Milestones: BrewIndex

---

## v1.0 MVP — Shipped 2026-06-08

**Phases:** 1–5.1 (6 phases: Data Pipeline, Catalog UI, Search + Security, Discovery Layer, Railway Migration, Icon Storage Migration)  
**Plans:** 20 total, all complete  
**Timeline:** 2026-05-24 → 2026-05-27 (4 days active development)  
**LOC:** ~3,200 TypeScript (src + backend)  
**Files:** 176 files changed, 41,794 insertions

**Delivered:**  
A fully working App Store-like web catalog for 7,659+ Homebrew casks — browse, search, filter, sort, detail pages with install commands, GitHub social proof, dark Raycast-inspired design, and production infrastructure on Railway ($5/mo) with Tigris S3 icon storage.

### Key Accomplishments

1. **Full data pipeline shipped** — 7,659 casks synced daily from Homebrew API into Railway Postgres with throttled GitHub enrichment (1,083 casks), DuckDuckGo favicon icons stored on Tigris S3, full SSRF protection with RFC 1918 block (21-entry allowlist)
2. **Polished dark catalog UI** — Raycast-inspired design (near-black `#0e0e0e`, electric violet `#7c6aff`) with card grid, CaskCard with icon/initials, detail pages with hero/install/stats/metadata, CopyButton clipboard island, top-500 ISR pre-rendering
3. **Full-text search** — Postgres tsvector GIN index, debounced SearchInput client island, search branch in browse page, loading skeletons for smooth UX
4. **Category filter + sort + GitHub stats** — AWS Bedrock Nova Micro categorization ($0.14 for full catalog), category pills and sort dropdown, GitHubStatsCard on detail pages, StarBadge on browse cards
5. **Railway infrastructure migration** — Moved from Neon + Vercel Cron to Railway Postgres + Hono backend + Railway cron; ISR revalidation webhook; icon storage migrated to Tigris S3
6. **Security foundation** — CRON_SECRET bearer auth, SSRF allowlist, Zod input validation on search API, Fluid Compute opt-in, per-icon fault isolation

### Requirements

- **12/15 active requirements satisfied**
- **3 partial (known gap accepted):** BRWS-02, BRWS-03, BRWS-04 — pagination does not preserve filter/sort state across pages
- **3 deferred:** SRCH-02 (platform filter), SECU-01 (rate limiting), SECU-02 (WAF)

### Known Deferred Items at Close

- Pagination state loss (BRWS-02, BRWS-03, BRWS-04): Pagination component discards filter/sort URL params on page navigation. Single-component fix deferred to v1.1.
- Phase 5 (Railway Migration) not formally verified with VERIFICATION.md.

### Audit

- **Report:** `.planning/milestones/v1.0-MILESTONE-AUDIT.md`
- **Status:** gaps_found (3 partial requirements; accepted as tech debt)

---
