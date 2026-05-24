# Phase 1: Data Pipeline - Research

**Researched:** 2026-05-24
**Domain:** Homebrew API ingestion, Neon Postgres, Drizzle ORM, Vercel Blob icon storage, GitHub API enrichment, SSRF defense, cron security
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01 — Cron Frequency:** Run once daily. Homebrew publishes once per day — more frequent syncs get stale data. Hobby plan covers once/day at zero additional cost.

**D-02 — GitHub Enrichment Batching:** Enrich GitHub stats within the same cron run. Process casks in batches of ~4,500 with a 1-hour sleep between batches so the run stays under the 5K/hr authenticated limit. `@octokit/plugin-throttling` handles retry-after automatically.
> **RESEARCHER NOTE:** D-02 was based on an overestimated cask count. Verified: only **1,083** casks have a `github.com` homepage — well under the 5,000/hr primary rate limit. The 1-hour sleep and 4,500-batch design are unnecessary; all GitHub enrichment fits in a single pass (~3–5 minutes with burst allowance). The planner should surface this to the user before locking a sleep-based strategy. See Pitfall #4.

**D-03 — GitHub Auth:** Use a Personal Access Token (PAT) with `read:repo` scope, stored as `GITHUB_TOKEN` env var.

**D-04 — GitHub 404 Handling:** If a cask's GitHub repo returns 404 or is inaccessible: log the failure, set `github_enriched = false`, leave github_stars/forks/issues as NULL. The next sync retries automatically.

**D-05 — Schema Shape:** Single flat `casks` table — all fields inline, no joins.

**D-06 — Core Fields:** `id`, `token`, `name`, `description`, `version`, `homepage`, `icon_url`, `icon_is_fallback` (bool), `install_30d`, `install_90d`, `install_365d`, `github_stars`, `github_forks`, `github_issues`, `github_enriched` (bool), `is_active` (bool), `last_synced_at`.

**D-07 — Upsert Strategy:** `INSERT ... ON CONFLICT (token) DO UPDATE`. Idempotent, fast, safe.

**D-08 — Soft Delete:** Casks that vanish from the Homebrew API get `is_active = false`.

**D-09 — ISR Invalidation:** Call `revalidateTag('casks')` after a successful sync.

### Claude's Discretion

- Exact Homebrew JSON API endpoint structure and field mapping (researcher to confirm)
- Drizzle schema migration tooling (`drizzle-kit push` for dev, `drizzle-kit migrate` for prod)
- Vercel Blob upload approach for icons (direct upload from sync job)
- SSRF allowlist implementation details (fetch wrapper vs. middleware)

### Deferred Ideas (OUT OF SCOPE)

- Categories / tag taxonomy — Phase 4
- Platform compatibility filter — Phase 3
- Cask caveats and install warnings — v2
- Bottle/binary download URL — v2
- Formulae (CLI tools) sync — future milestone
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DATA-01 | Cask data synced from Homebrew JSON API daily via cron into Neon Postgres | Homebrew API endpoints verified; Drizzle + Neon-HTTP upsert pattern documented |
| DATA-02 | Cask icons fetched from homepage domain favicon at sync time, stored in Vercel Blob | DuckDuckGo favicon service confirmed live; Vercel Blob `put()` API documented; 404-detection strategy verified |
| DATA-03 | GitHub stats (stars, forks, issues) enriched at sync time for casks with GitHub upstream | Confirmed 1,083 GitHub-homepaged casks; Octokit throttling pattern documented; rate limit analysis complete |
| SECU-03 | Cron sync endpoint protected by `CRON_SECRET` bearer token validation | Exact pattern from Vercel official docs (manage-cron-jobs); returns 401 before any work |
| SECU-04 | All server-side fetch calls restricted to explicit hostname allowlist | SSRF fetch-wrapper pattern documented; allowlist: formulae.brew.sh, api.github.com, icons.duckduckgo.com, blob.vercel-storage.com |
</phase_requirements>

---

## Summary

Phase 1 is a pure data pipeline with no UI. The sync job fetches the Homebrew cask catalog (~7,659 casks in a 15.5 MB JSON payload) from `formulae.brew.sh/api/cask.json`, merges install-count data from three separate analytics endpoints, uploads favicon images to Vercel Blob, enriches ~1,083 GitHub-hosted casks with repo stats, and upserts everything into a single flat `casks` table in Neon Postgres via Drizzle ORM. The job is triggered daily by a Vercel Cron Job via a GET route handler protected by `CRON_SECRET`.

**Critical discovery:** The Homebrew bulk `cask.json` payload does **not** include analytics (install counts). These must be fetched separately from three analytics endpoints (`30d`, `90d`, `365d`), which return a flat `{ formulae: { token: [{count: "1,234"}] } }` map with comma-formatted count strings. The sync job must merge data from four total API calls before writing to the database.

**Critical timing finding:** D-02 was designed for a full 7,659-cask GitHub enrichment (which would require batching). Verified data shows only 1,083 casks have a `github.com` homepage — this fits comfortably in a single pass under 5 minutes with burst allowance, well within Vercel Pro's 800-second function limit. The initial full population (first-ever run) takes an estimated 10–12 minutes on Pro plan; daily incremental runs take ~6–8 minutes. The 300-second Hobby limit cannot accommodate the full sync; Pro plan is required.

**Primary recommendation:** Build the sync as a single Next.js App Router Route Handler at `app/api/cron/sync/route.ts` with `export const maxDuration = 800`. On initial run, batch-insert all casks (500/batch) and process icons + GitHub in parallel within a concurrency cap of 10. On subsequent daily runs, only re-upload icons for casks where `icon_url` is NULL, and refresh GitHub stats for all GitHub-homepaged casks.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Homebrew API ingestion | API (cron route handler) | — | Server-side only; no browser involvement |
| Install count analytics merge | API (sync job, in-memory) | — | Data transformation before DB write |
| Postgres schema + migrations | Database (Drizzle schema) | API (drizzle-kit) | Schema owns structure; migrations run at deploy |
| Icon fetch from DuckDuckGo | API (sync job) | — | Server-side fetch with SSRF allowlist; not hotlinked |
| Icon storage | CDN / Static (Vercel Blob) | API (upload) | Blobs served directly; upload happens in sync job |
| GitHub stats enrichment | API (sync job) | — | Server-side authenticated API calls |
| Cron authentication | API (route handler guard) | — | CRON_SECRET check before any work |
| SSRF protection | API (fetch wrapper) | — | Wraps all outbound fetch calls; allowlist enforced |
| ISR cache invalidation | API / Frontend Server | — | `revalidateTag` called post-sync; consumed by Phase 2 pages |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.2.6 [VERIFIED: npm registry] | Framework — App Router, Route Handlers, ISR | Project-mandated; current stable |
| `@neondatabase/serverless` | 1.1.0 [VERIFIED: npm registry] | HTTP-based Postgres driver for serverless | Eliminates TCP exhaustion; project-mandated |
| `drizzle-orm` | 0.45.2 [VERIFIED: npm registry] | TypeScript ORM with Neon-HTTP integration | Project-mandated; typed upserts, batch inserts |
| `drizzle-kit` | 0.31.10 [VERIFIED: npm registry] | Schema migration CLI (`push`/`migrate`) | Required companion to drizzle-orm |
| `@vercel/blob` | 2.4.0 [VERIFIED: npm registry] | Icon image storage | Project-mandated; S3-backed CDN, public URL |
| `@octokit/rest` | 22.0.1 [VERIFIED: npm registry] | GitHub REST API client | Project-mandated; typed, auto-retry |
| `@octokit/plugin-throttling` | 11.0.3 [VERIFIED: npm registry] | Automatic rate-limit throttling for Octokit | Project-mandated; handles primary + secondary limits |
| `zod` | 4.4.3 [VERIFIED: npm registry] | Runtime schema validation for API responses | Project-mandated |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | 5.x [ASSUMED] | Type-checking | Required for all source files |
| `@types/node` | 22.x [ASSUMED] | Node.js type definitions | Required for fs, URL, etc. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| DuckDuckGo favicon service | icon.horse | icon.horse also confirmed live (200 OK), returns PNG; DuckDuckGo returns .ico; both have 404 for unknown domains. Either works — DuckDuckGo is more widely used in community projects |
| Drizzle batch insert | Individual upserts (1 per cask) | Individual upserts: 7659 × 50ms = ~383s. Batch inserts (500/batch): 16 batches × 300ms = ~5s. Batch is mandatory for timing |
| `revalidateTag(tag, 'max')` | `revalidateTag(tag)` (deprecated) | Single-arg form is deprecated in Next.js 16.x; must use two-arg form |

**Installation:**

```bash
npm install next@latest typescript @types/node
npm install @neondatabase/serverless drizzle-orm zod
npm install @vercel/blob @octokit/rest @octokit/plugin-throttling
npm install -D drizzle-kit tsx dotenv
```

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads/wk | Source Repo | slopcheck | Disposition |
|---------|----------|-----|--------------|-------------|-----------|-------------|
| `@neondatabase/serverless` | npm | 3.5 yrs | 2,091,277 | github.com/neondatabase/serverless | N/A | Approved |
| `drizzle-orm` | npm | 4.7 yrs | 9,894,591 | github.com/drizzle-team/drizzle-orm | N/A | Approved |
| `drizzle-kit` | npm | 4.7 yrs | 8,151,306 | github.com/drizzle-team/drizzle-orm | N/A | Approved |
| `@vercel/blob` | npm | 3 yrs | 3,708,512 | github.com/vercel/storage | N/A | Approved |
| `@upstash/ratelimit` | npm | 4 yrs | 1,472,826 | github.com/upstash/ratelimit | N/A | Approved |
| `@upstash/redis` | npm | 4.5 yrs | 3,250,290 | github.com/upstash/upstash-redis | N/A | Approved |
| `@octokit/rest` | npm | 8 yrs | 15,185,896 | github.com/octokit/rest.js | N/A | Approved |
| `@octokit/plugin-throttling` | npm | 7 yrs | 7,247,528 | github.com/octokit/plugin-throttling.js | N/A | Approved |
| `zod` | npm | 5 yrs | high (major OSS dep) | github.com/colinhacks/zod | N/A | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck was unavailable at research time. All packages above confirmed via npm registry and official source repositories — all are well-established (3+ years, millions of weekly downloads, official org maintainers). No postinstall scripts found on any package.*

---

## Architecture Patterns

### System Architecture Diagram

```
[Vercel Cron Scheduler]
        |
        | GET /api/cron/sync
        | Authorization: Bearer {CRON_SECRET}
        v
[SSRF Fetch Wrapper] ──validates hostname allowlist──>
        |
        ├──> GET formulae.brew.sh/api/cask.json         (15.5MB, 7,659 casks)
        ├──> GET formulae.brew.sh/api/analytics/...30d  (install counts)
        ├──> GET formulae.brew.sh/api/analytics/...90d
        └──> GET formulae.brew.sh/api/analytics/...365d
              |
              | merge: cask data + install counts
              v
        [In-memory: Map<token, CaskRow>]
              |
              ├──> [for each cask WITHOUT icon_url]
              |         GET icons.duckduckgo.com/ip3/{domain}.ico
              |         if 200: PUT @vercel/blob → store URL
              |         if 404: set icon_is_fallback=true
              |
              ├──> [for each cask with github.com homepage]
              |         GET api.github.com/repos/{owner}/{repo}
              |         store stars, forks, open_issues
              |         [throttled by @octokit/plugin-throttling]
              |
              v
        [Drizzle ORM batch INSERT...ON CONFLICT(token) DO UPDATE]
              |
              v
        [Neon Postgres — casks table]
              |
              v
        [revalidateTag('casks', 'max')]  ──> ISR cache invalidated
```

### Recommended Project Structure

```
src/
├── app/
│   └── api/
│       └── cron/
│           └── sync/
│               └── route.ts        # GET handler, CRON_SECRET guard, maxDuration=800
├── db/
│   ├── schema.ts                   # Drizzle pgTable definition
│   ├── index.ts                    # drizzle(neon(DATABASE_URL)) export
│   └── migrations/                 # drizzle-kit generated SQL
├── lib/
│   ├── fetch-allowlist.ts          # SSRF fetch wrapper
│   ├── homebrew.ts                 # Homebrew API fetch + field mapping
│   ├── icons.ts                    # DuckDuckGo fetch + Vercel Blob upload
│   └── github.ts                   # Octokit instance + repo stats fetch
drizzle.config.ts                   # drizzle-kit config
vercel.json                         # cron job schedule
```

### Pattern 1: Drizzle Schema with Flat Casks Table

```typescript
// src/db/schema.ts
// Source: https://orm.drizzle.team/docs/get-started/neon-new (Context7 equivalent)
import { pgTable, text, integer, boolean, timestamp, serial } from 'drizzle-orm/pg-core';

export const casks = pgTable('casks', {
  id:              serial('id').primaryKey(),
  token:           text('token').notNull().unique(),
  name:            text('name').notNull(),          // first element of name[] array
  description:     text('description'),
  version:         text('version'),
  homepage:        text('homepage'),
  icon_url:        text('icon_url'),
  icon_is_fallback: boolean('icon_is_fallback').notNull().default(false),
  install_30d:     integer('install_30d'),
  install_90d:     integer('install_90d'),
  install_365d:    integer('install_365d'),
  github_stars:    integer('github_stars'),
  github_forks:    integer('github_forks'),
  github_issues:   integer('github_issues'),
  github_enriched: boolean('github_enriched').notNull().default(false),
  is_active:       boolean('is_active').notNull().default(true),
  last_synced_at:  timestamp('last_synced_at').notNull().defaultNow(),
});
```

### Pattern 2: Drizzle + Neon-HTTP Connection

```typescript
// src/db/index.ts
// Source: https://orm.drizzle.team/docs/get-started/neon-new
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

### Pattern 3: Batch Upsert (mandatory for performance)

```typescript
// Source: Drizzle official docs — onConflictDoUpdate
// DO NOT use individual upserts (7659 × 50ms = 383s)
// Batch 500 rows per INSERT for ~5s total
import { db } from '@/db';
import { casks } from '@/db/schema';

const BATCH_SIZE = 500;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  await db
    .insert(casks)
    .values(batch)
    .onConflictDoUpdate({
      target: casks.token,
      set: {
        name: sql`excluded.name`,
        description: sql`excluded.description`,
        version: sql`excluded.version`,
        install_30d: sql`excluded.install_30d`,
        install_90d: sql`excluded.install_90d`,
        install_365d: sql`excluded.install_365d`,
        is_active: sql`excluded.is_active`,
        last_synced_at: sql`excluded.last_synced_at`,
      },
    });
}
```

### Pattern 4: CRON_SECRET Guard

```typescript
// app/api/cron/sync/route.ts
// Source: https://vercel.com/docs/cron-jobs/manage-cron-jobs (verified 2026-02-27)
import type { NextRequest } from 'next/server';

export const maxDuration = 800; // Pro plan max

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... sync work
}
```

### Pattern 5: SSRF Fetch Wrapper

```typescript
// src/lib/fetch-allowlist.ts
// Wraps all outbound HTTP calls in the sync job
const ALLOWED_HOSTS = new Set([
  'formulae.brew.sh',
  'api.github.com',
  'icons.duckduckgo.com',
  'icon.horse',
  // Vercel Blob upload endpoint is a PUT to the SDK; SDK handles the URL internally
]);

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: hostname ${hostname} not in allowlist`);
  }
  return fetch(url, init);
}
```

### Pattern 6: Octokit with Throttling

```typescript
// src/lib/github.ts
// Source: https://github.com/octokit/plugin-throttling.js
import { Octokit } from '@octokit/core';
import { throttling } from '@octokit/plugin-throttling';

const ThrottledOctokit = Octokit.plugin(throttling);

export const octokit = new ThrottledOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      if (retryCount < 2) return true; // retry twice
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      return true; // always retry secondary limits
    },
  },
});
```

### Pattern 7: revalidateTag (two-arg form — required in Next.js 16.x)

```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/revalidateTag (v16.2.6)
// Single-arg form is DEPRECATED — use two-arg form
import { revalidateTag } from 'next/cache';

revalidateTag('casks', 'max');   // stale-while-revalidate semantics
// OR for immediate expiry (e.g. webhook callers that need instant flush):
revalidateTag('casks', { expire: 0 });
```

### Pattern 8: vercel.json Cron Configuration

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 6 * * *"
    }
  ]
}
```

### Pattern 9: Homebrew API Field Mapping

The bulk `cask.json` endpoint does **not** include analytics. Field mapping requires merging two data sources:

```typescript
// Source: verified live from formulae.brew.sh/api/cask/firefox.json and analytics endpoint
interface HomebrewCask {
  token: string;            // "firefox"
  name: string[];           // ["Mozilla Firefox"] — take name[0]
  desc: string | null;      // "Web browser"
  homepage: string;         // "https://www.mozilla.org/firefox/"
  version: string;          // "135.0"
  deprecated: boolean;      // exclude deprecated casks from active set
  disabled: boolean;        // exclude disabled casks from active set
}

interface AnalyticsEntry {
  cask: string;
  count: string;            // "204,909" — must strip commas before parseInt
}
```

### Anti-Patterns to Avoid

- **Individual row upserts:** `for (cask of allCasks) await db.insert(cask)...` — 7,659 × 50ms = 383 seconds. Use batch inserts of 500.
- **Hotlinking DuckDuckGo icons:** Store in Vercel Blob. Hotlinks break on Vercel's `next/image` remote patterns, have no SLA, and violate DATA-02.
- **Blocking response until GitHub enrichment completes:** Return 200 before full enrichment if needed; or accept that on Pro the full run fits in 800s.
- **revalidateTag single-arg form:** `revalidateTag('casks')` is deprecated in Next.js 16.x. Will generate TypeScript errors and may be removed in a future release.
- **Fetching single-cask endpoints for analytics:** The single-cask endpoint (`/api/cask/{token}.json`) includes embedded analytics, but fetching 7,659 individual endpoints would be extremely slow. Always use the bulk analytics endpoints.
- **Parallelizing all GitHub requests without throttling:** Without `@octokit/plugin-throttling`, concurrent requests trigger secondary rate limits (403). Always use the throttled Octokit instance.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GitHub API rate limit handling | Manual sleep loops, retry logic | `@octokit/plugin-throttling` | Secondary rate limits have complex retry semantics; throttling plugin handles `retry-after`, exponential backoff, and primary + secondary limits automatically |
| SSRF protection | Next.js middleware URL rewriting | Fetch wrapper in sync job | Middleware runs on all routes; SSRF risk is scoped to server-side data pipeline, not user traffic. A targeted fetch wrapper is simpler and won't break other routes |
| Postgres upserts | Raw SQL strings | Drizzle `.onConflictDoUpdate()` | Type-safety, parameter binding (prevents SQL injection), proper conflict target resolution |
| Icon placeholder generation | Custom SVG initials generator | `icon_is_fallback = true` DB flag + CSS in Phase 2 | Data pipeline stores the flag; visual rendering belongs in Phase 2 UI |
| Distributed concurrency lock for cron | Redis SETNX implementation | `CRON_SECRET` + idempotent upserts | Vercel may invoke cron more than once; upsert-on-conflict already handles duplicate runs safely — no lock needed for this workload |

**Key insight:** The GitHub API rate limit handling has non-obvious retry semantics (primary vs. secondary limits, `retry-after` headers, CPU throttling). The `@octokit/plugin-throttling` plugin encodes GitHub's official recommendations — hand-rolling this correctly takes significant effort and is error-prone.

---

## Common Pitfalls

### Pitfall 1: Analytics Not in Bulk cask.json

**What goes wrong:** Sync job fetches `cask.json`, writes rows, finds `install_30d = null` for all casks.
**Why it happens:** The 15.5 MB bulk endpoint does NOT include analytics. Only individual cask endpoints (`/api/cask/{token}.json`) embed analytics, but fetching 7,659 individual endpoints is impractical.
**How to avoid:** Always fetch the three analytics endpoints (`/api/analytics/cask-install/homebrew-cask/30d.json`, `90d`, `365d`) separately and build an in-memory lookup map keyed by `token` before the DB write.
**Warning signs:** `install_30d` column is always NULL despite data being available on the Homebrew website.

### Pitfall 2: Comma-Formatted Count Strings

**What goes wrong:** `parseInt("204,909")` returns `204` (stops at comma). DB stores truncated install counts.
**Why it happens:** The Homebrew analytics API returns counts as locale-formatted strings: `"204,909"`, `"1,234"`. This is consistent across all periods.
**How to avoid:** Strip commas before parsing: `parseInt(count.replace(/,/g, ''), 10)`.
**Warning signs:** Install counts look suspiciously low (e.g., 204 instead of 204,909).

### Pitfall 3: DuckDuckGo 404 Returns a PNG Body

**What goes wrong:** Icon fallback detection logic checks for empty body. DuckDuckGo returns a placeholder PNG image with HTTP 404 status for unknown domains.
**Why it happens:** DuckDuckGo's favicon service always returns image content, but uses 404 status when no favicon was found. The body is not empty.
**How to avoid:** Check the **HTTP status code** (`response.status !== 200`), not body length or content. If 404 → `icon_is_fallback = true`, skip Blob upload.
**Warning signs:** All icons uploaded to Blob are the same 1478-byte placeholder PNG.

### Pitfall 4: D-02's 1-Hour Sleep Strategy is Unnecessary

**What goes wrong:** Plan implements a 1-hour `setTimeout()` between GitHub batches, which immediately exceeds the 800s function limit and the cron job crashes.
**Why it happens:** D-02 was designed assuming all 7,659 casks need GitHub enrichment. Verified: only 1,083 casks have a `github.com` homepage — one order of magnitude fewer than assumed.
**How to avoid:** Process all 1,083 GitHub casks in a single async loop using `octokit.request()` with the throttling plugin. With burst allowance (~900 req/min secondary limit), all 1,083 complete in ~3–5 minutes, well under the 800s limit. No sleep needed.
**Warning signs:** Test run of the GitHub enrichment step times out or the cron function never returns 200.

### Pitfall 5: Vercel Function Duration Limits

**What goes wrong:** Initial full populate crashes mid-run. Daily cron silently times out.
**Why it happens:** Default `maxDuration` is 300s; Pro max is 800s. The full sync (batch DB + icon pipeline + GitHub) takes ~10–12 minutes on first run against an empty database.
**How to avoid:** (1) Set `export const maxDuration = 800` in the route handler (Pro plan required). (2) For the initial populate, provide a local script that runs outside Vercel (e.g., `npx tsx scripts/seed.ts`) to avoid function limits entirely. (3) On subsequent runs, skip re-uploading icons that already have `icon_url != NULL` — reduces icon pipeline from ~3 min to ~10s.
**Warning signs:** Cron logs show 504 or no response; DB only partially populated.

### Pitfall 6: revalidateTag Single-Arg Deprecated

**What goes wrong:** TypeScript error or silent no-op in future Next.js version.
**Why it happens:** `revalidateTag('casks')` (single arg) is deprecated in Next.js 16.x. The documentation explicitly recommends `revalidateTag(tag, 'max')`.
**How to avoid:** Always use the two-argument form: `revalidateTag('casks', 'max')` for stale-while-revalidate, or `revalidateTag('casks', { expire: 0 })` for immediate expiry.
**Warning signs:** TypeScript warning "deprecated" on `revalidateTag` call.

### Pitfall 7: Non-Repo GitHub URLs

**What goes wrong:** `GET /repos/codeql.github.com` returns 404; sync logs errors for valid casks.
**Why it happens:** 7 of the 1,083 "github-homepaged" casks have non-repo URLs like `https://codeql.github.com/` or `https://docs.github.com/en/...`. 9 additional casks are Google Fonts repos.
**How to avoid:** GitHub URL extraction regex must match the pattern `https://github.com/{owner}/{repo}` exactly. Use: `const match = url.match(/^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/)`. Only enrich if `match` is non-null. For Exclusions: skip if owner is `googlefonts` or repo contains `font`.
**Warning signs:** Sync logs show many 404s from Octokit for known casks.

### Pitfall 8: name Field is an Array

**What goes wrong:** `cask.name` stored as `"[\"Mozilla Firefox\"]"` (JSON-stringified array).
**Why it happens:** The Homebrew API returns `name` as `string[]` (e.g., `["Mozilla Firefox", "Firefox"]`). The DB schema expects a single `text` value.
**How to avoid:** Always extract `cask.name[0]` when mapping to the DB row. Log a warning if `name.length > 1` (some casks have multiple display names).
**Warning signs:** cask name column contains bracket characters.

---

## Code Examples

### Homebrew API Full Field Mapping

```typescript
// Source: verified from https://formulae.brew.sh/api/cask/firefox.json (2026-05-24)
// and bulk https://formulae.brew.sh/api/cask.json (7,659 items confirmed)
function mapHomebrewCask(
  cask: HomebrewCask,
  analytics: Map<string, { d30: number; d90: number; d365: number }>
): CaskInsertRow {
  const counts = analytics.get(cask.token) ?? { d30: 0, d90: 0, d365: 0 };
  return {
    token: cask.token,
    name: cask.name[0],
    description: cask.desc ?? null,
    version: cask.version,
    homepage: cask.homepage,
    install_30d: counts.d30,
    install_90d: counts.d90,
    install_365d: counts.d365,
    is_active: !cask.deprecated && !cask.disabled,
    last_synced_at: new Date(),
  };
}

function parseAnalytics(raw: string): number {
  // Source: verified — analytics counts are comma-formatted strings
  return parseInt(raw.replace(/,/g, ''), 10) || 0;
}
```

### Icon Pipeline

```typescript
// Source: verified DuckDuckGo favicon service behavior (2026-05-24)
// 200 = real favicon, 404 = no favicon (body is still PNG — check status only)
import { put } from '@vercel/blob';

async function fetchAndStoreIcon(
  token: string,
  homepage: string
): Promise<{ url: string | null; isFallback: boolean }> {
  const domain = new URL(homepage).hostname;
  const faviconUrl = `https://icons.duckduckgo.com/ip3/${domain}.ico`;

  const res = await safeFetch(faviconUrl);
  if (res.status !== 200) {
    return { url: null, isFallback: true };
  }

  const iconBuffer = await res.arrayBuffer();
  const blob = await put(`icons/${token}.ico`, iconBuffer, {
    access: 'public',
    contentType: 'image/x-icon',
    allowOverwrite: true,
  });

  return { url: blob.url, isFallback: false };
}
```

### GitHub Repo Detection with Exclusions

```typescript
// Source: verified from live Homebrew data analysis (2026-05-24)
// 1,083 casks with github.com homepage; 9 google font repos; 7 non-repo URLs
const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/;
const EXCLUDED_OWNERS = new Set(['googlefonts']);

function extractGithubRepo(homepage: string): { owner: string; repo: string } | null {
  const match = homepage.match(GITHUB_REPO_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  if (EXCLUDED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo };
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `revalidateTag(tag)` (single arg) | `revalidateTag(tag, 'max')` (two args) | Next.js 16.x | Single-arg is deprecated; must update or TypeScript will warn |
| `@vercel/kv` for rate-limit backing | `@upstash/redis` directly | December 2024 | Vercel KV deprecated, auto-migrated to Upstash. Do not use `@vercel/kv`. |
| `drizzle-orm/neon-serverless` | `drizzle-orm/neon-http` | Early 2023 | HTTP driver is correct for serverless; WebSocket driver is for long-lived connections |
| Vercel cron Hobby unlimited frequency | Hobby: once/day max; Pro: per-minute | Ongoing policy | Daily sync requires Hobby (or Pro for more frequent) |

**Deprecated/outdated:**
- `@vercel/kv`: Marked deprecated on npm; removed from Vercel dashboard. Do not use.
- `revalidateTag(tag)` single-arg: Deprecated in Next.js 16.x. Migrate to two-arg form.
- Fetching individual cask endpoints for analytics: Impractical (7,659 requests). Use bulk analytics endpoint.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Each new/changed cask produces ~50 new casks per daily incremental run | Common Pitfalls / Timing | If churn is higher (e.g., 500/day), icon pipeline takes longer; may need parallelism tuning |
| A2 | DuckDuckGo favicon service has no official rate limit or terms restriction for automated use | Standard Stack | Service could throttle or block; fallback to icon.horse or skip icons entirely |
| A3 | Neon free-tier 0.5 GB is sufficient for 7,659 cask rows | Environment Availability | Each row ~2KB × 7,659 = ~15MB; no risk. But if caveats/other fields added later, monitor |
| A4 | Vercel Blob Hobby advanced operation limit (900/min) is not hit during icon pipeline | Common Pitfalls | Initial bulk upload: 7,659 uploads ÷ 15 ops/sec = 511s → exceeds 300s Hobby limit. Mitigation: initial seed must run on Pro or as a local script |
| A5 | DuckDuckGo returns 200 for all major app domains (not just browsers) | Code Examples | Coverage rate is unknown; some niche apps may return 404; CSS fallback covers these |

---

## Open Questions

1. **Initial seed strategy**
   - What we know: Full initial populate takes ~10–12 min on Pro (exceeds Hobby 300s limit).
   - What's unclear: Should initial seed be a local CLI script (`npx tsx scripts/seed.ts`) or a one-time manual Vercel deployment with high `maxDuration`?
   - Recommendation: Provide a `scripts/seed.ts` that runs locally against the production Neon DB. This avoids function limits and is safer for a one-time operation.

2. **Icon re-upload strategy on subsequent syncs**
   - What we know: Re-uploading all 7,659 icons daily takes ~3 min and costs advanced Blob operations.
   - What's unclear: Should icons be re-fetched if a cask's `version` changes (app icon may have changed)?
   - Recommendation: Only upload icons when `icon_url IS NULL`. Version changes rarely change app icons. If icon refresh is needed, add a separate monthly cron job.

3. **D-02 batching strategy needs user confirmation**
   - What we know: D-02 was designed for 7,659 GitHub enrichments. Actual count is 1,083.
   - What's unclear: User may want the 1-hour sleep retained as a future-proofing measure, or may want it removed.
   - Recommendation: Surface this to user before planning locks D-02. The simpler single-pass approach is recommended.

4. **`icon_url` for Vercel Blob path format**
   - What we know: Blob `put()` returns `{ url: "https://*.public.blob.vercel-storage.com/icons/{token}.ico" }`.
   - What's unclear: Should the full URL be stored, or just the path (and reconstruct URL at read time)?
   - Recommendation: Store the full URL (simpler, no reconstruction needed, portable if store changes).

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js runtime, scripts | ✓ | v24.11.0 | — |
| npm | Package installation | ✓ | v11.6.1 | — |
| Vercel CLI | Env pull, deployment | ✓ | v54.4.1 | Manual env vars |
| git | Version control | ✓ | v2.50.1 | — |
| Next.js project scaffold | Framework | ✗ | — | `npx create-next-app@latest` |
| Neon DB (cloud) | Postgres storage | ✗ (not yet provisioned) | — | Must create at neon.com |
| Upstash Redis (cloud) | Rate limiting (Phase 3) | ✗ (not yet provisioned) | — | Out of scope for Phase 1 |
| Vercel Blob store (cloud) | Icon storage | ✗ (not yet provisioned) | — | Must create in Vercel dashboard |
| GITHUB_TOKEN (PAT) | GitHub API enrichment | ✗ (not yet created) | — | Unauthenticated (60 req/hr — insufficient) |
| CRON_SECRET | Cron endpoint auth | ✗ (not yet generated) | — | Must generate random 32-char string |

**Missing dependencies with no fallback:**
- Next.js scaffold (create-next-app required before any code can be written)
- Neon database (provisioned at neon.com; `DATABASE_URL` env var required)
- Vercel Blob store (`BLOB_READ_WRITE_TOKEN` or OIDC via `BLOB_STORE_ID` required)
- `GITHUB_TOKEN` PAT (unauthenticated GitHub API rate limit of 60/hr is insufficient for 1,083 enrichments)

**Missing dependencies with fallback:**
- CRON_SECRET: Can be generated locally with `openssl rand -hex 32` before first deploy

---

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json` — this section is skipped per config.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (cron endpoint) | CRON_SECRET Bearer token comparison before any work |
| V3 Session Management | no | Cron endpoint is stateless; no sessions |
| V4 Access Control | yes | Cron endpoint is the only mutating route in this phase; returns 401 if unauthenticated |
| V5 Input Validation | yes (API responses) | Zod schema validation on Homebrew and GitHub API responses |
| V6 Cryptography | no | No encryption needed; icon URLs are public; secrets stored as Vercel env vars |
| V10 SSRF | yes | Fetch wrapper enforces hostname allowlist; blocks any URL not in approved set |

### Known Threat Patterns for This Stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unauthenticated cron trigger | Elevation of Privilege | `CRON_SECRET` Bearer comparison; 401 before any work begins |
| SSRF via homepage URL processing | Information Disclosure | Fetch wrapper allowlist: only `formulae.brew.sh`, `api.github.com`, `icons.duckduckgo.com`, Blob storage allowed |
| GitHub token leakage | Information Disclosure | `GITHUB_TOKEN` stored as Vercel environment variable; never logged; never returned in API responses |
| Homebrew API response injection | Tampering | Zod validation on all API response shapes; reject malformed payloads |
| Vercel Cron double-invocation | Denial of Service | Upsert-on-conflict makes duplicate runs idempotent; no lock needed but concurrency is low risk for daily sync |
| DuckDuckGo favicon redirect to attacker-controlled URL | SSRF | Verify redirect destination hostname also passes allowlist check (or disable redirect following entirely) |

**SSRF favicon-redirect risk:** The DuckDuckGo service may internally redirect to the actual `favicon.ico` at the homepage domain. The sync job should either: (a) call `fetch()` with `redirect: 'follow'` but validate the final response URL is not within the internal network (`169.254.x.x`, `10.x.x.x`, `127.x.x.x`), or (b) use `redirect: 'manual'` and only follow redirects to explicitly approved domains. The fetch allowlist wrapper must handle redirect chains, not just the initial URL.

---

## Sources

### Primary (HIGH confidence)

- Homebrew API — live endpoint verification (2026-05-24): `formulae.brew.sh/api/cask.json` (7,659 items), `formulae.brew.sh/api/analytics/cask-install/homebrew-cask/30d|90d|365d.json`
- Homebrew cask field structure — `formulae.brew.sh/api/cask/firefox.json` live verification (name is array, analytics not in bulk endpoint, deprecated/disabled flags confirmed)
- Drizzle + Neon-HTTP — https://orm.drizzle.team/docs/get-started/neon-new (verified 2026-05-24)
- Vercel Cron + CRON_SECRET — https://vercel.com/docs/cron-jobs/manage-cron-jobs (verified 2026-02-27)
- Vercel Function duration limits — https://vercel.com/docs/functions/configuring-functions/duration (Pro: 800s max, verified 2026-02-27)
- Vercel Blob SDK `put()` — https://vercel.com/docs/vercel-blob/using-blob-sdk (verified 2026-02-19)
- Vercel Blob rate limits — https://vercel.com/docs/vercel-blob/usage-and-pricing (Hobby: 15 ops/sec, Pro: 75 ops/sec)
- Next.js revalidateTag — https://nextjs.org/docs/app/api-reference/functions/revalidateTag (v16.2.6, verified 2026-05-19; single-arg deprecated confirmed)
- Next.js Route Handlers — https://nextjs.org/docs/app/api-reference/file-conventions/route (v16.2.6)
- @octokit/plugin-throttling — https://github.com/octokit/plugin-throttling.js (verified 2026-05-24)
- GitHub API rate limits — https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api (5,000/hr PAT, 900 GET/min secondary, verified 2026-05-24)
- Upstash Ratelimit — https://upstash.com/docs/redis/sdks/ratelimit-ts/gettingstarted (Redis.fromEnv(), slidingWindow, verified 2026-05-24)
- npm registry version + download verification — all packages confirmed 2026-05-24

### Secondary (MEDIUM confidence)

- DuckDuckGo favicon service behavior — live HTTP probing (2026-05-24): 200 for known domains, 404 for unknown, PNG body regardless; no documented rate limits
- Neon free tier limits — https://neon.com/docs/introduction/plans (0.5 GB, 100 CU-hr/mo, scale-to-zero after 5 min)

### Tertiary (LOW confidence)

- Daily cask churn estimate (~50 new/changed per day) — extrapolated from 7,659 total casks with daily Homebrew publishing cadence; not empirically measured
- DuckDuckGo favicon coverage rate for Homebrew cask domains — not measured; assumed moderate (~70–80% based on community reports)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified on npm registry with creation dates, download counts, source repos
- Architecture: HIGH — all API endpoints verified live; Vercel function limits from official docs
- Pitfalls: HIGH for verified pitfalls (comma-formatted counts, name-is-array, 404-PNG body, revalidateTag deprecation); MEDIUM for timing estimates (based on per-request latency assumptions)
- D-02 batching concern: HIGH — 1,083 GitHub casks is a verified live count; 5,000/hr limit is from official GitHub docs

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (stable APIs; re-verify if Homebrew API structure changes or Next.js major version bumps)
