---
phase: 01-data-pipeline
plan: "04"
subsystem: infra
tags: [github-api, octokit, throttling, cron, drizzle-orm, data-enrichment]

# Dependency graph
requires:
  - phase: 01-03
    provides: "src/lib/icons.ts, cron route with icon pipeline"
  - phase: 01-01
    provides: "src/lib/fetch-allowlist.ts (safeFetch), src/db/schema.ts (github_stars/forks/issues/github_enriched)"
provides:
  - "src/lib/github.ts — throttled Octokit singleton, extractGithubRepo (with exclusions), fetchGithubStats (D-04 null on 404/403)"
  - "Cron route updated with sequential GitHub enrichment step after icon pipeline, before revalidateTag"
  - "Success response includes github_enriched and github_failed counts"
affects:
  - "Phase 2 catalog UI — github_stars/forks/issues/github_enriched columns now populated"
  - "DATA-03 requirement satisfied — full data pipeline complete"

# Tech tracking
tech-stack:
  added:
    - "@octokit/core Octokit.plugin(throttling) ThrottledOctokit singleton"
    - "drizzle-orm like() for homepage LIKE '%github.com%' query"
  patterns:
    - "Octokit singleton with @octokit/plugin-throttling — onRateLimit retries 2x; onSecondaryRateLimit always retries"
    - "extractGithubRepo strict regex /^https:\\/\\/github\\.com\\/([^\\/]+)\\/([^\\/\\?#]+)/ excludes non-repo GitHub URLs"
    - "EXCLUDED_OWNERS Set(['googlefonts']) prevents enrichment of font repositories"
    - "fetchGithubStats returns null (not throw) on 404/403 per D-04 — caller sets github_enriched=false"
    - "Sequential for...of loop for GitHub enrichment (not Promise.all) — throttling plugin manages rate limits"

key-files:
  created:
    - src/lib/github.ts
  modified:
    - src/app/api/cron/sync/route.ts

key-decisions:
  - "D-02 correction: only 1,083 casks have github.com homepages (verified live count) — single sequential pass fits comfortably under 5K/hr primary rate limit with no sleep loops"
  - "Sequential for...of loop chosen over Promise.all for GitHub enrichment — allows @octokit/plugin-throttling to apply retry-after semantics correctly; parallel requests can trigger secondary rate limits"
  - "extractGithubRepo strict regex ensures only actual /{owner}/{repo} paths are enriched — non-repo GitHub domains (codeql.github.com, docs.github.com) return null and are skipped"
  - "fetchGithubStats null return (not throw) on 404/403 is the correct D-04 pattern — these are expected non-error conditions for casks whose GitHub repos are deleted or private"

patterns-established:
  - "GitHub enrichment pattern: query LIKE '%github.com%' → extractGithubRepo (regex + exclusions) → fetchGithubStats (throttled, null on 404) → per-row DB update"
  - "Throttled Octokit singleton: create ThrottledOctokit class once at module level, export as singleton — never recreate per request"

requirements-completed:
  - DATA-03

# Metrics
duration: ~5min
completed: 2026-05-24
---

# Phase 01 Plan 04: GitHub Enrichment Summary

Throttled Octokit singleton with `@octokit/plugin-throttling`, strict regex URL extraction excluding non-repo GitHub URLs and `googlefonts` owner, and sequential cron integration that enriches ~1,083 casks with GitHub stars/forks/issues in a single pass.

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-24
- **Completed:** 2026-05-24
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created `src/lib/github.ts` with throttled Octokit singleton — `@octokit/plugin-throttling` handles primary (5K/hr) and secondary (900/min) rate limits automatically; no manual sleep loops
- `extractGithubRepo` uses strict regex to exclude non-repo GitHub URLs (`codeql.github.com`, `docs.github.com`) and `googlefonts` owner
- `fetchGithubStats` returns `null` (not throw) on 404/403 per D-04 — caller sets `github_enriched = false`; unexpected errors are re-thrown
- Wired GitHub enrichment into cron route as final step after icon pipeline and before `revalidateTag('casks', 'max')`
- Sequential `for...of` loop (not `Promise.all`) ensures throttling plugin can apply retry-after semantics
- Success response includes `github_enriched` and `github_failed` counts for observability

## Full Pipeline — All Phase 1 Success Criteria Met

After this plan, the complete pipeline in `src/app/api/cron/sync/route.ts` is:
1. CRON_SECRET guard (SECU-03)
2. Homebrew API fetch + install count analytics merge (DATA-01)
3. Batch upsert 500 rows/batch + soft-delete inactive casks
4. Incremental icon pipeline — DuckDuckGo favicon → Vercel Blob (DATA-02)
5. GitHub enrichment — sequential, throttled, null on 404 (DATA-03)
6. `revalidateTag('casks', 'max')` — ISR invalidation (D-09)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create src/lib/github.ts** - `d1d552f` (feat)
2. **Task 2: Wire GitHub enrichment into cron route** - `efe07a1` (feat)

## Files Created/Modified

- `src/lib/github.ts` — throttled Octokit singleton, `extractGithubRepo` (strict regex + owner exclusions), `fetchGithubStats` (D-04 null return on 404/403)
- `src/app/api/cron/sync/route.ts` — added GitHub enrichment step (sequential for...of, LIKE query, per-row DB update) between icon pipeline and `revalidateTag`

## Decisions Made

- Single sequential pass of 1,083 GitHub casks is the correct implementation — D-02's original 4,500-batch + 1-hour-sleep strategy was based on an incorrect assumption of 7,659 GitHub-homepaged casks; actual verified count is 1,083
- `for...of` sequential loop chosen intentionally to allow `@octokit/plugin-throttling` to apply `retry-after` headers correctly; parallelizing with `Promise.all` would overwhelm the secondary rate limit (900 GET/min)
- `extractGithubRepo` returns null for URLs lacking `/{owner}/{repo}` path segments — the strict regex `/^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/` correctly handles non-repo GitHub subdomains without additional special-casing

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. `github_enriched`, `github_stars`, `github_forks`, and `github_issues` are fully populated by the enrichment loop for all casks with `github.com` homepages.

## Threat Surface Scan

No new security-relevant surface beyond the plan's threat model:

- T-04-01 (token leakage): `GITHUB_TOKEN` never appears in logs — `console.warn` logs only `owner/repo` path (public Homebrew data)
- T-04-02 (path traversal): `extractGithubRepo` regex segments `([^\/]+)` exclude `/`, `?`, `#` characters — no path traversal possible in `octokit.request('GET /repos/{owner}/{repo}', ...)`
- T-04-03 (DoS/rate limit): `@octokit/plugin-throttling` with `onRateLimit` and `onSecondaryRateLimit` handlers active
- T-04-05 (spoofing): regex must match full `https://github.com/{owner}/{repo}` — subdomain URLs like `codeql.github.com` return null from `extractGithubRepo`

## Self-Check: PASSED

Files created/exist:
- `src/lib/github.ts` — FOUND
- `src/app/api/cron/sync/route.ts` — FOUND (modified)

Commits:
- `d1d552f` — FOUND (Task 1: github.ts)
- `efe07a1` — FOUND (Task 2: cron route update)

TypeScript: 0 errors (`npx tsc --noEmit`)
Grep checks:
- `extractGithubRepo` in route.ts — CONFIRMED (lines 8, 114)
- `github_enriched` set to false and true in route.ts — CONFIRMED (lines 123, 133)
- `revalidateTag('casks', 'max')` last step before return — CONFIRMED (line 140)
- No actual `setTimeout` or `sleep` function calls in route.ts — CONFIRMED (only comment matches)
- No stubs (TODO/FIXME/placeholder) in created/modified files — CONFIRMED
