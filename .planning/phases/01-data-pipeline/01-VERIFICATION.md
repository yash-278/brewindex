---
phase: 01-data-pipeline
verified: 2026-05-24T00:00:00Z
status: gaps_found
score: 4/6 must-haves verified
re_verification: null
gaps:
  - truth: "All four env vars (DATABASE_URL, CRON_SECRET, GITHUB_TOKEN, BLOB_READ_WRITE_TOKEN) are validated at startup with a descriptive error if missing"
    status: failed
    reason: "The missing-env check in route.ts only validates DATABASE_URL and CRON_SECRET. GITHUB_TOKEN and BLOB_READ_WRITE_TOKEN are absent from the check. A missing GITHUB_TOKEN causes the cron to silently fall back to 60 req/hr unauthenticated GitHub API access, and the uncapped onSecondaryRateLimit handler in github.ts unconditionally returns true (no retry cap), which can cause the function to spin indefinitely against secondary rate limits until Vercel kills it."
    artifacts:
      - path: "src/app/api/cron/sync/route.ts"
        issue: "Line 21: const missing = ['DATABASE_URL', 'CRON_SECRET'] — GITHUB_TOKEN and BLOB_READ_WRITE_TOKEN absent from validation"
      - path: "src/lib/github.ts"
        issue: "Line 17-19: onSecondaryRateLimit unconditionally returns true with no retryCount cap — unbounded retry loop when GITHUB_TOKEN missing"
    missing:
      - "Add 'GITHUB_TOKEN' and 'BLOB_READ_WRITE_TOKEN' to the missing-env check in route.ts"
      - "Add retryCount < 2 guard to onSecondaryRateLimit in github.ts to cap retries"

  - truth: "All server-side HTTP calls restricted to explicit allowlist (SECU-04)"
    status: failed
    reason: "BLOCKED_CIDR_PREFIXES in fetch-allowlist.ts omits the RFC 1918 172.16.0.0/12 private block (172.16.x.x through 172.31.x.x). A redirect from any allowlisted host to an address in this range would pass the post-redirect check unblocked. The allowlist correctly blocks 10.x, 192.168.x, 127.x, 169.254.x, and ::1, but the 172.16/12 gap is a real SSRF exposure that violates SECU-04's completeness requirement."
    artifacts:
      - path: "src/lib/fetch-allowlist.ts"
        issue: "Line 8: BLOCKED_CIDR_PREFIXES = ['127.', '10.', '192.168.', '169.254.', '::1'] — missing '172.16.' through '172.31.' prefixes"
    missing:
      - "Add 172.16. through 172.31. prefixes to BLOCKED_CIDR_PREFIXES (16 entries) — or use a proper CIDR library like is-my-ip-private"
---

# Phase 1: Data Pipeline Verification Report

**Phase Goal:** The database is populated with all Homebrew cask data, icons, and GitHub stats, refreshed daily by a secured cron job
**Verified:** 2026-05-24T00:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Next.js project scaffolded and builds without TypeScript errors | ✓ VERIFIED | `npx tsc --noEmit` exits 0 (0 errors confirmed) |
| 2 | Neon Postgres has a casks table matching the D-06 schema | ✓ VERIFIED | src/db/schema.ts defines pgTable('casks') with all 17 data columns + serial id = 18 columns total; drizzle.config.ts confirms push config |
| 3 | GET /api/cron/sync returns 401 when called without Authorization header | ✓ VERIFIED | route.ts lines 16-19: auth guard is first executable statement; returns `new Response('Unauthorized', { status: 401 })` on missing/wrong CRON_SECRET |
| 4 | safeFetch() blocks any URL whose hostname is not in the allowlist, throwing SSRF_BLOCKED | ✓ VERIFIED | fetch-allowlist.ts lines 11-14: throws `SSRF_BLOCKED: hostname "..." not in allowlist` for any off-allowlist host; also validates post-redirect hostname |
| 5 | All four env vars (DATABASE_URL, CRON_SECRET, GITHUB_TOKEN, BLOB_READ_WRITE_TOKEN) are validated at startup with descriptive error if missing | ✗ FAILED | route.ts line 21 checks only DATABASE_URL and CRON_SECRET. GITHUB_TOKEN and BLOB_READ_WRITE_TOKEN are not validated. Missing GITHUB_TOKEN causes silent unauthenticated fallback (60 req/hr) with unbounded throttle retry loop (CR-03 from REVIEW.md). |
| 6 | All server-side HTTP calls restricted to explicit allowlist (SECU-04 — RFC 1918 fully blocked) | ✗ FAILED | fetch-allowlist.ts BLOCKED_CIDR_PREFIXES omits the 172.16.0.0/12 range. CR-02 from REVIEW.md confirms this is a real gap. The 4-entry allowlist (formulae.brew.sh, api.github.com, icons.duckduckgo.com, icon.horse) correctly controls the outbound hosts, but the redirect-chain private-IP check is incomplete. |

**Score:** 4/6 truths verified

### Roadmap Success Criteria Assessment

From ROADMAP.md Phase 1 success criteria:

| # | Criterion | Status | Notes |
|---|-----------|--------|-------|
| 1 | Cron endpoint populates Neon with all ~7,659 casks including name, token, description, version, homepage, and comma-stripped install counts | ✓ VERIFIED | homebrew.ts: fetchHomebrewCatalog + fetchHomebrewAnalytics + parseAnalyticsCount (strips commas before parseInt). route.ts: 500-row batch upsert with notInArray soft-delete. |
| 2 | Each cask row has icon_url pointing to Vercel Blob asset (or icon_is_fallback = true) — no hotlinked external favicons | ✓ VERIFIED | icons.ts: safeFetch + put() to Vercel Blob. Incremental isNull guard. HTTP status 404 detection (res.status !== 200). No raw fetch in icons.ts. |
| 3 | Casks with GitHub upstream repo have stars, forks, open issues stored | ✓ VERIFIED | github.ts: throttled Octokit singleton, extractGithubRepo (strict regex, EXCLUDED_OWNERS), fetchGithubStats (null on 404/403). Sequential for...of loop in route.ts. |
| 4 | Calling endpoint without valid Bearer token returns 401 and performs no work | ✓ VERIFIED | CRON_SECRET guard is the first statement in the GET handler before any DB or fetch calls |
| 5 | All server-side HTTP calls restricted to explicit allowlist; any off-allowlist URL is blocked at the fetch wrapper | ✗ FAILED | The allowlist hostname check works correctly. The post-redirect SSRF check is incomplete — missing 172.16.0.0/12 range (SECU-04 gap). |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/db/schema.ts` | Drizzle pgTable for casks with 18 columns | ✓ VERIFIED | All 18 columns present: id, token, name, description, version, homepage, icon_url, icon_is_fallback, install_30d, install_90d, install_365d, github_stars, github_forks, github_issues, github_enriched, is_active, last_synced_at. CaskInsertRow and CaskSelectRow exported. |
| `src/db/index.ts` | Drizzle + neon-http connection | ✓ VERIFIED | `import { drizzle } from 'drizzle-orm/neon-http'` — correct HTTP driver |
| `src/lib/fetch-allowlist.ts` | SSRF-safe fetch wrapper | ✓ VERIFIED (partial) | Contains "SSRF_BLOCKED:", 4-host allowlist correct, but 172.16/12 range missing from redirect check |
| `src/app/api/cron/sync/route.ts` | Cron route handler with auth guard | ✓ VERIFIED (partial) | CRON_SECRET guard present, full pipeline wired; env var validation incomplete (missing GITHUB_TOKEN, BLOB_READ_WRITE_TOKEN) |
| `vercel.json` | Cron job schedule "0 6 * * *" | ✓ VERIFIED | Present at path "/api/cron/sync" with schedule "0 6 * * *" |
| `drizzle.config.ts` | drizzle-kit push configuration | ✓ VERIFIED | dialect 'postgresql', schema './src/db/schema.ts', dotenv .env.local loading present |
| `src/lib/homebrew.ts` | Homebrew API fetch + analytics merge + field mapping | ✓ VERIFIED | fetchHomebrewCatalog, fetchHomebrewAnalytics, mapHomebrewCask, parseAnalyticsCount all present and substantive |
| `scripts/seed.ts` | Local initial populate script | ✓ VERIFIED | Imports dotenv/config, runs full batch upsert with progress logging, package.json has "seed" script entry |
| `src/lib/icons.ts` | DuckDuckGo favicon fetch + Vercel Blob upload | ✓ VERIFIED | fetchAndStoreIcon exported; safeFetch used (not raw fetch); res.status !== 200 check; put() with access: 'public' |
| `src/lib/github.ts` | Octokit with throttling, extractGithubRepo, fetchGithubStats | ✓ VERIFIED | ThrottledOctokit singleton at module level; extractGithubRepo with EXCLUDED_OWNERS; fetchGithubStats returns null on 404/403 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `route.ts` | `fetch-allowlist.ts` | `import { safeFetch }` | ✓ WIRED | safeFetch imported indirectly through homebrew.ts, icons.ts (route.ts uses those modules which use safeFetch) |
| `route.ts` | `src/db/index.ts` | `import { db } from '@/db'` | ✓ WIRED | Line 4: `import { db } from '@/db'` |
| `src/db/index.ts` | `drizzle-orm/neon-http` | `drizzle(process.env.DATABASE_URL!)` | ✓ WIRED | Confirmed: `drizzle-orm/neon-http` driver used |
| `route.ts` | `src/lib/homebrew.ts` | `import { fetchHomebrewCatalog, fetchHomebrewAnalytics }` | ✓ WIRED | Line 6: both functions imported and called at lines 33-35 |
| `src/lib/homebrew.ts` | `src/lib/fetch-allowlist.ts` | `import { safeFetch }` | ✓ WIRED | Line 2: imported; used at lines 80, 95, 96, 97 |
| `route.ts` | `src/lib/icons.ts` | `import { fetchAndStoreIcon }` | ✓ WIRED | Line 7: imported and called at line 87 |
| `src/lib/icons.ts` | `src/lib/fetch-allowlist.ts` | `import { safeFetch }` | ✓ WIRED | Line 2: imported; used at line 19 |
| `route.ts` | `src/lib/github.ts` | `import { extractGithubRepo, fetchGithubStats }` | ✓ WIRED | Line 8: imported; used at lines 114, 118 |
| `src/lib/github.ts` | `@octokit/plugin-throttling` | `Octokit.plugin(throttling)` | ✓ WIRED | Lines 1-5: imported and applied |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `route.ts` — batch upsert | `rows` | `catalog.map(cask => mapHomebrewCask(...))` from `fetchHomebrewCatalog()` | Yes — fetches from formulae.brew.sh via safeFetch, Zod-validated | ✓ FLOWING |
| `route.ts` — analytics | `analyticsMap` | `fetchHomebrewAnalytics()` — 3 endpoints, Map built from AnalyticsResponseSchema | Yes — real API data, commas stripped | ✓ FLOWING |
| `route.ts` — icons | `casksNeedingIcons` | DB query `WHERE icon_url IS NULL`, then `fetchAndStoreIcon` | Yes — DuckDuckGo fetch, Vercel Blob put() | ✓ FLOWING |
| `route.ts` — GitHub | `githubCasks` | DB query `WHERE homepage LIKE '%github.com%'`, then `octokit.request` | Yes — throttled Octokit, real GitHub API | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| TypeScript compiles clean | `npx tsc --noEmit \| grep "error TS" \| wc -l` | 0 | ✓ PASS |
| CRON_SECRET guard is first in handler | `grep -n "CRON_SECRET" route.ts \| head -1` | Line 17 (first code after maxDuration export) | ✓ PASS |
| revalidateTag called with 2 args | `grep "revalidateTag" route.ts` | `revalidateTag('casks', 'max')` line 140 | ✓ PASS |
| BATCH_SIZE = 500 present | `grep "BATCH_SIZE" route.ts` | `const BATCH_SIZE = 500` line 12 | ✓ PASS |
| notInArray soft-delete present | `grep "notInArray" route.ts` | line 69: `notInArray(casks.token, fetchedTokens)` | ✓ PASS |
| No sleep/setTimeout in route.ts | `grep -c "setTimeout\|sleep" route.ts` | 1 (comment only — "no sleep loops needed") | ✓ PASS |
| safeFetch used in icons.ts (not raw fetch) | `grep "fetch(" src/lib/icons.ts` | only `safeFetch(faviconUrl)` | ✓ PASS |
| parseAnalyticsCount strips commas | Code review | `parseInt(raw.replace(/,/g, ''), 10) \|\| 0` | ✓ PASS |
| GITHUB_TOKEN absent from env validation | `grep "GITHUB_TOKEN" route.ts` | Not present in missing-env array | ✗ FAIL (gap) |
| 172.16/12 range absent from SSRF check | `grep "172" fetch-allowlist.ts` | No 172.16 entries in BLOCKED_CIDR_PREFIXES | ✗ FAIL (gap) |
| No per-icon try/catch in icon pipeline | Lines 84-98 of route.ts | No try/catch inside Promise.all map callback | ✗ FAIL (noted below — not a must-have truth, but a correctness issue) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| DATA-01 | 01-02 | Cask data synced from Homebrew API daily via cron into Neon Postgres | ✓ SATISFIED | fetchHomebrewCatalog + fetchHomebrewAnalytics + 500-row batch upsert + notInArray soft-delete all implemented |
| DATA-02 | 01-03 | Cask icons fetched and stored in Vercel Blob (not hotlinked) | ✓ SATISFIED | icons.ts: fetchAndStoreIcon → safeFetch → put() to Vercel Blob; incremental isNull guard |
| DATA-03 | 01-04 | GitHub stats enriched at sync time for casks with GitHub upstream | ✓ SATISFIED | github.ts: throttled Octokit, extractGithubRepo (strict regex + exclusions), fetchGithubStats; wired into route.ts |
| SECU-03 | 01-01, 01-04 | Cron endpoint protected by CRON_SECRET bearer token | ✓ SATISFIED | CRON_SECRET guard is first statement in handler, returns 401 before any work on missing/wrong token |
| SECU-04 | 01-01, 01-04 | All server-side fetches restricted to explicit allowlist | ✗ BLOCKED | Hostname allowlist is correct and all lib files use safeFetch. However, post-redirect check misses 172.16.0.0/12 RFC 1918 range. Incomplete SSRF protection. |

**Orphaned requirements check:** REQUIREMENTS.md maps DATA-01, DATA-02, DATA-03, SECU-03, SECU-04 to Phase 1 — all five are claimed by phase plans. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/api/cron/sync/route.ts` | 86-98 | No per-icon try/catch in Promise.all map — a single transient icon failure aborts all remaining icons AND skips GitHub enrichment AND suppresses revalidateTag | ⚠️ Warning | Single DuckDuckGo timeout or Blob quota error kills the entire sync run; GitHub stats never written; ISR never invalidated. Noted as CR-01 in REVIEW.md. |
| `src/app/api/cron/sync/route.ts` | 103-106 | GitHub enrichment query lacks `is_active = true` filter | ⚠️ Warning | Soft-deleted casks still processed, wasting GitHub API rate-limit budget. REVIEW.md WR-01. |
| `src/app/api/cron/sync/route.ts` | 74-77 | Icon pipeline query lacks `is_active = true` filter | ⚠️ Warning | Soft-deleted casks get icons uploaded to Blob unnecessarily. REVIEW.md WR-03. |
| `src/app/api/cron/sync/route.ts` | 21 | CRON_SECRET re-checked in missing-env array after already being used as auth guard | ℹ️ Info | Dead code — code path can never emit 500 with missing CRON_SECRET. REVIEW.md WR-04. |
| `vercel.json` | 5 | No `functions` block for maxDuration — `maxDuration = 800` in route.ts requires Vercel Fluid Compute enabled | ⚠️ Warning | Without Fluid Compute opt-in in vercel.json, standard Pro serverless clamps to 300s. Full sync may be hard-killed mid-run. REVIEW.md CR-04. |

### Human Verification Required

None identified for this phase. All pipeline logic is verifiable from static analysis. The actual population of the Neon database and Vercel Blob storage requires a live environment but the pipeline code is correctness-verified above.

---

## Gaps Summary

Two gaps block phase goal achievement:

**Gap 1 — SECU-04 incomplete (BLOCKER):** `fetch-allowlist.ts` BLOCKED_CIDR_PREFIXES omits the 172.16.0.0/12 RFC 1918 private IP range. The 4-entry hostname allowlist is correct, but the post-redirect check that validates redirect destinations against private IPs has a hole. Any allowlisted host (e.g., icons.duckduckgo.com) could redirect to a 172.16.x.x–172.31.x.x address and the check would pass. SECU-04 requires _all_ server-side HTTP calls to be SSRF-protected — this gap violates that requirement.

**Gap 2 — Incomplete env var validation (BLOCKER):** The startup env-var check in route.ts validates only DATABASE_URL and CRON_SECRET. GITHUB_TOKEN and BLOB_READ_WRITE_TOKEN are not validated. The Plan 01-01 must_have explicitly listed all four vars as required. Beyond the spec violation, a missing GITHUB_TOKEN causes a silent operational failure: the cron degrades to 60 req/hr unauthenticated GitHub access, and the `onSecondaryRateLimit` handler in github.ts has no retry cap (`retryCount < 2` guard absent), creating a potential unbounded retry loop that exhausts the 800s function budget before ISR invalidation is ever reached.

**Additional correctness issues found in REVIEW.md (not blocking but risky):**

- CR-01: No per-icon try/catch inside the icon pipeline's `Promise.all` — a single transient failure aborts all subsequent icons, the GitHub enrichment step, and ISR invalidation.
- CR-04: `maxDuration = 800` in route.ts has no corresponding `functions` block in `vercel.json` — Vercel Fluid Compute is not opted in, so standard Pro serverless silently caps at 300s.

These two are correctness/reliability issues that prevent the sync from running reliably in production, but they do not map directly to a roadmap success criterion the way the two blockers do.

---

_Verified: 2026-05-24T00:00:00Z_
_Verifier: Claude (gsd-verifier)_
