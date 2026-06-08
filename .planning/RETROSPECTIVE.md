# Retrospective: BrewIndex

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-06-08  
**Phases:** 6 | **Plans:** 20

### What Was Built

- Full data pipeline: 7,659 casks synced from Homebrew API daily, DuckDuckGo favicon icons on Tigris S3, GitHub enrichment for 1,083 casks, full SSRF protection
- Dark Raycast-inspired catalog UI: CaskCard grid, detail pages with hero/install/stats, CopyButton clipboard island, ISR pre-rendering for top-500
- Full-text search: Postgres tsvector GIN, debounced SearchInput, loading skeletons
- Category filter + sort + GitHub stats: AWS Nova Micro ML categorization ($0.14), category pills, sort dropdown, GitHubStatsCard
- Railway infrastructure: migrated from Neon + Vercel Cron to Railway Postgres + Hono backend + Railway cron; Tigris S3 icon CDN

### What Worked

- **Sketch-first design** eliminated rework: 2 sketch sessions before any component code; dark Raycast-inspired theme validated; no visual direction changes during build
- **Phase verification loop** caught real bugs: Phase 1 re-verification found and fixed RFC 1918 SSRF gap, missing env validation, unbounded GitHub retry loop, and missing is_active filters — all before production
- **Vertical slice execution**: each phase delivered a usable end-to-end capability; no half-baked states between phases
- **ISR + revalidateTag pattern**: cache invalidation after sync is clean; zero per-request DB hits in production browse pages
- **Railway migration was smooth**: driver swap + monorepo coexistence worked; ISR revalidation webhook was the only integration friction

### What Was Inefficient

- **Pagination-filter mismatch**: Phase 2 built Pagination component without filter context; Phase 4 added filters without updating Pagination — a cross-phase communication gap that only surfaced at audit. Should have been flagged as a cross-phase dependency during Phase 4 planning.
- **Phase 5.1 (icon migration) was reactive**: Vercel Blob quota issue forced a mid-milestone migration. The cost/quota constraints of Vercel Blob should have been evaluated in Phase 1 planning, not discovered in production.
- **Nova Micro model format discovery**: Phase 4 plan specified Claude Haiku request format; Nova Micro uses a different schema. Required 2 auto-fix iterations. Better model docs research upfront would have avoided this.
- **Phase 5 never verified**: Railway migration completed all 4 plans and had human smoke-test checkpoints, but no formal VERIFICATION.md was written. Left a formal gap at milestone audit.

### Patterns Established

- **RSC + client island pattern**: Server Components for all data fetching; client islands (`'use client'` as first line, named export) for clipboard, search debounce, filter/sort — clean boundary
- **URL-state for filter/sort/search**: All browse state lives in URL params (`?q=`, `?category=`, `?sort=`, `?page=`); components read via `useSearchParams()` or server `searchParams` — back button works correctly, links are shareable
- **Per-icon fault isolation in Promise.all**: `try/catch` wrapping each async task inside `Promise.all` prevents a single failure from aborting the batch — established in Phase 1 gap closure, applicable everywhere
- **Railway Tigris S3 env names**: Railway Tigris plugin injects `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (not `S3_*`) — document this in future plans
- **Vercel WAF bypass header**: Railway backend needs `x-vercel-protection-bypass` header when calling Vercel `/api/revalidate` in protected deployments

### Key Lessons

1. **Cross-phase integration points need explicit callouts**: When Phase 4 added filter/sort, the plan should have explicitly noted "Pagination component from Phase 2 needs to be made filter-aware." The gap only appeared at audit.
2. **Check infra quota limits early**: Vercel Blob quota was discovered in production. Add a "quota/cost feasibility" step to infra decisions in requirements.
3. **Write VERIFICATION.md when there are human smoke-test checkpoints**: Phase 5 had human checkpoints (smoke test approved) but no formal VERIFICATION.md. The checkpoint output should become the verification document.
4. **Nova Micro is much cheaper than Haiku for classification**: For single-label, fixed-taxonomy classification tasks, Nova Micro at $0.14/7,659 items beats Claude 3.5 Haiku (~$30). Use it by default for similar tasks.
5. **revalidateTag with ISR**: The pattern of `unstable_cache` with `tags: ['casks']` + `revalidateTag('casks')` in the sync webhook is clean and reliable. Don't use time-based TTL for data that has a known update event.

### Cost Observations

- AWS Bedrock Nova Micro categorization: ~$0.14 for 7,659 casks
- Railway hobby tier: ~$5/month (Postgres + backend + cron)
- Tigris S3: negligible storage cost; no per-operation quota
- Development sessions: ~4 days active work (2026-05-24 → 2026-05-27)

---

## Cross-Milestone Trends

| Metric | v1.0 |
|--------|------|
| Phases | 6 |
| Plans | 20 |
| LOC (TS) | ~3,200 |
| Days active | 4 |
| Verification re-runs | 1 (Phase 1) |
| Known gaps at close | 3 requirements partial |
| Deferred requirements | 3 |
