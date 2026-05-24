# Phase 1: Data Pipeline - Pattern Map

**Mapped:** 2026-05-24
**Files analyzed:** 9 new files
**Analogs found:** 0 / 9 — greenfield project; all patterns sourced from RESEARCH.md verified sources

> **Greenfield note:** No source files exist in the repository yet. All patterns below are
> drawn from official library documentation verified by the researcher (see RESEARCH.md §Sources)
> and the project's locked technology choices in CLAUDE.md. The planner must treat these as
> "reference implementations to copy and adapt" rather than "existing codebase analogs."

---

## File Classification

| New File | Role | Data Flow | Closest Analog | Match Quality |
|----------|------|-----------|----------------|---------------|
| `src/app/api/cron/sync/route.ts` | controller (route handler) | request-response + batch | none (greenfield) | no analog — use Pattern 4 |
| `src/db/schema.ts` | model (Drizzle schema) | CRUD | none (greenfield) | no analog — use Pattern 1 |
| `src/db/index.ts` | config (DB connection) | CRUD | none (greenfield) | no analog — use Pattern 2 |
| `src/lib/fetch-allowlist.ts` | utility (SSRF wrapper) | request-response | none (greenfield) | no analog — use Pattern 5 |
| `src/lib/homebrew.ts` | service (external API client) | batch + transform | none (greenfield) | no analog — use Pattern 9 |
| `src/lib/icons.ts` | service (icon pipeline) | file-I/O + request-response | none (greenfield) | no analog — use Pattern (Icon Pipeline) |
| `src/lib/github.ts` | service (external API client) | request-response + batch | none (greenfield) | no analog — use Pattern 6 |
| `drizzle.config.ts` | config (migration CLI) | — | none (greenfield) | no analog — use drizzle-kit docs |
| `vercel.json` | config (cron schedule) | event-driven | none (greenfield) | no analog — use Pattern 8 |

---

## Pattern Assignments

### `src/app/api/cron/sync/route.ts` (controller, request-response + batch)

**Source:** Vercel official docs — https://vercel.com/docs/cron-jobs/manage-cron-jobs (verified 2026-02-27)

**Imports pattern:**
```typescript
import type { NextRequest } from 'next/server';
import { revalidateTag } from 'next/cache';
import { db } from '@/db';
import { casks } from '@/db/schema';
import { fetchHomebrewCatalog, fetchHomebrewAnalytics } from '@/lib/homebrew';
import { fetchAndStoreIcon } from '@/lib/icons';
import { fetchGithubStats } from '@/lib/github';
```

**Auth/Guard pattern — CRON_SECRET check (must be first, before any work):**
```typescript
export const maxDuration = 800; // Pro plan max — required for full sync

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ALL sync work goes here — after the auth check
}
```

**Core batch-upsert pattern (500 rows per batch — mandatory for performance):**
```typescript
import { sql } from 'drizzle-orm';

const BATCH_SIZE = 500;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  await db
    .insert(casks)
    .values(batch)
    .onConflictDoUpdate({
      target: casks.token,
      set: {
        name:           sql`excluded.name`,
        description:    sql`excluded.description`,
        version:        sql`excluded.version`,
        install_30d:    sql`excluded.install_30d`,
        install_90d:    sql`excluded.install_90d`,
        install_365d:   sql`excluded.install_365d`,
        is_active:      sql`excluded.is_active`,
        last_synced_at: sql`excluded.last_synced_at`,
      },
    });
}
```

**ISR invalidation — two-arg form required in Next.js 16.x:**
```typescript
// Single-arg revalidateTag('casks') is DEPRECATED in Next.js 16.x — always use two args
revalidateTag('casks', 'max');
```

**Error handling pattern:**
```typescript
try {
  // ... sync work ...
  return new Response(JSON.stringify({ ok: true, synced: rows.length }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} catch (err) {
  console.error('[cron/sync] fatal error', err);
  return new Response(JSON.stringify({ ok: false, error: String(err) }), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}
```

**Soft-delete pattern (casks that vanished from API):**
```typescript
// After upsert: mark any token NOT in the fetched set as inactive
// Build a Set<string> of all fetched tokens, then:
await db
  .update(casks)
  .set({ is_active: false })
  .where(notInArray(casks.token, fetchedTokens));
```

---

### `src/db/schema.ts` (model, CRUD)

**Source:** Drizzle ORM official docs — https://orm.drizzle.team/docs/get-started/neon-new

**Imports pattern:**
```typescript
import {
  pgTable, text, integer, boolean, timestamp, serial,
} from 'drizzle-orm/pg-core';
```

**Core schema pattern — flat casks table (D-05 / D-06):**
```typescript
export const casks = pgTable('casks', {
  id:               serial('id').primaryKey(),
  token:            text('token').notNull().unique(),        // conflict target for upsert
  name:             text('name').notNull(),                  // cask.name[0] — array in API
  description:      text('description'),
  version:          text('version'),
  homepage:         text('homepage'),
  icon_url:         text('icon_url'),
  icon_is_fallback: boolean('icon_is_fallback').notNull().default(false),
  install_30d:      integer('install_30d'),
  install_90d:      integer('install_90d'),
  install_365d:     integer('install_365d'),
  github_stars:     integer('github_stars'),
  github_forks:     integer('github_forks'),
  github_issues:    integer('github_issues'),
  github_enriched:  boolean('github_enriched').notNull().default(false),
  is_active:        boolean('is_active').notNull().default(true),
  last_synced_at:   timestamp('last_synced_at').notNull().defaultNow(),
});

export type CaskInsertRow = typeof casks.$inferInsert;
export type CaskSelectRow = typeof casks.$inferSelect;
```

---

### `src/db/index.ts` (config, CRUD)

**Source:** Drizzle ORM official docs — https://orm.drizzle.team/docs/get-started/neon-new

**Core connection pattern — neon-http driver (not neon-serverless WebSocket):**
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

// drizzle-orm/neon-http is correct for Vercel serverless — no TCP connection exhaustion
// Do NOT use drizzle-orm/neon-serverless (WebSocket — for long-lived connections only)
export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

---

### `src/lib/fetch-allowlist.ts` (utility, request-response)

**Source:** SECU-04 requirement + RESEARCH.md §Pattern 5

**Core SSRF allowlist pattern:**
```typescript
const ALLOWED_HOSTS = new Set([
  'formulae.brew.sh',
  'api.github.com',
  'icons.duckduckgo.com',
  'icon.horse',
  // Vercel Blob uploads use the SDK directly (no raw fetch needed)
]);

// Internal / link-local IP ranges to block on redirect resolution
const BLOCKED_CIDR_PREFIXES = ['127.', '10.', '192.168.', '169.254.', '::1'];

export async function safeFetch(url: string, init?: RequestInit): Promise<Response> {
  const hostname = new URL(url).hostname;
  if (!ALLOWED_HOSTS.has(hostname)) {
    throw new Error(`SSRF_BLOCKED: hostname "${hostname}" not in allowlist`);
  }
  const response = await fetch(url, { ...init, redirect: 'follow' });
  // Validate final URL after redirects to catch favicon redirect chains
  const finalHostname = new URL(response.url).hostname;
  if (BLOCKED_CIDR_PREFIXES.some(p => finalHostname.startsWith(p))) {
    throw new Error(`SSRF_BLOCKED: redirect target "${finalHostname}" is a private address`);
  }
  return response;
}
```

---

### `src/lib/homebrew.ts` (service, batch + transform)

**Source:** RESEARCH.md §Pattern 9 + §Code Examples — verified from live Homebrew API 2026-05-24

**Imports pattern:**
```typescript
import { z } from 'zod/v4';
import { safeFetch } from './fetch-allowlist';
import type { CaskInsertRow } from '@/db/schema';
```

**Zod validation schemas for API responses:**
```typescript
const HomebrewCaskSchema = z.object({
  token:      z.string(),
  name:       z.array(z.string()).min(1),   // PITFALL: name is an array — take [0]
  desc:       z.string().nullable(),
  homepage:   z.string(),
  version:    z.string(),
  deprecated: z.boolean(),
  disabled:   z.boolean(),
});

const AnalyticsEntrySchema = z.object({
  cask:  z.string(),
  count: z.string(),   // PITFALL: comma-formatted — "204,909" — must strip before parseInt
});

const AnalyticsResponseSchema = z.object({
  formulae: z.array(AnalyticsEntrySchema),
});
```

**Core field-mapping transform pattern:**
```typescript
const HOMEBREW_CASK_API  = 'https://formulae.brew.sh/api/cask.json';
const ANALYTICS_BASE     = 'https://formulae.brew.sh/api/analytics/cask-install/homebrew-cask';

export function parseAnalyticsCount(raw: string): number {
  // PITFALL: parseInt("204,909") === 204 (stops at comma). Strip commas first.
  return parseInt(raw.replace(/,/g, ''), 10) || 0;
}

export function mapHomebrewCask(
  cask: z.infer<typeof HomebrewCaskSchema>,
  analytics: Map<string, { d30: number; d90: number; d365: number }>
): CaskInsertRow {
  const counts = analytics.get(cask.token) ?? { d30: 0, d90: 0, d365: 0 };
  return {
    token:         cask.token,
    name:          cask.name[0],              // PITFALL: take [0] not whole array
    description:   cask.desc ?? null,
    version:       cask.version,
    homepage:      cask.homepage,
    install_30d:   counts.d30,
    install_90d:   counts.d90,
    install_365d:  counts.d365,
    is_active:     !cask.deprecated && !cask.disabled,
    last_synced_at: new Date(),
  };
}
```

**API fetch functions:**
```typescript
export async function fetchHomebrewCatalog() {
  const res = await safeFetch(HOMEBREW_CASK_API);
  if (!res.ok) throw new Error(`Homebrew catalog fetch failed: ${res.status}`);
  const raw = await res.json();
  return z.array(HomebrewCaskSchema).parse(raw);
}

export async function fetchHomebrewAnalytics(): Promise<Map<string, { d30: number; d90: number; d365: number }>> {
  const [d30raw, d90raw, d365raw] = await Promise.all([
    safeFetch(`${ANALYTICS_BASE}/30d.json`).then(r => r.json()),
    safeFetch(`${ANALYTICS_BASE}/90d.json`).then(r => r.json()),
    safeFetch(`${ANALYTICS_BASE}/365d.json`).then(r => r.json()),
  ]);
  // Build Map<token, counts> — PITFALL: analytics NOT included in bulk cask.json
  const map = new Map<string, { d30: number; d90: number; d365: number }>();
  // ... merge d30raw / d90raw / d365raw into map using AnalyticsResponseSchema
  return map;
}
```

---

### `src/lib/icons.ts` (service, file-I/O + request-response)

**Source:** RESEARCH.md §Icon Pipeline + §Pitfall 3 — verified DuckDuckGo behavior 2026-05-24

**Imports pattern:**
```typescript
import { put } from '@vercel/blob';
import { safeFetch } from './fetch-allowlist';
```

**Core icon pipeline pattern:**
```typescript
const DUCKDUCKGO_FAVICON = 'https://icons.duckduckgo.com/ip3';

export async function fetchAndStoreIcon(
  token: string,
  homepage: string
): Promise<{ url: string | null; isFallback: boolean }> {
  let domain: string;
  try {
    domain = new URL(homepage).hostname;
  } catch {
    return { url: null, isFallback: true };
  }

  const faviconUrl = `${DUCKDUCKGO_FAVICON}/${domain}.ico`;
  const res = await safeFetch(faviconUrl);

  // PITFALL: DuckDuckGo returns a PNG body even on 404 — check status, not body length
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

**Incremental re-upload guard (skip casks that already have icon_url):**
```typescript
// In the sync job, only call fetchAndStoreIcon for casks where icon_url IS NULL
// This avoids re-uploading all 7,659 icons on every daily run (~3 min savings)
if (!existingRow || existingRow.icon_url === null) {
  const { url, isFallback } = await fetchAndStoreIcon(row.token, row.homepage ?? '');
  row.icon_url = url;
  row.icon_is_fallback = isFallback;
}
```

---

### `src/lib/github.ts` (service, request-response + batch)

**Source:** RESEARCH.md §Pattern 6 + §Pitfall 7 — @octokit/plugin-throttling docs verified 2026-05-24

**Imports pattern:**
```typescript
import { Octokit } from '@octokit/core';
import { throttling } from '@octokit/plugin-throttling';
```

**Octokit instance with throttling (singleton — create once, reuse per run):**
```typescript
const ThrottledOctokit = Octokit.plugin(throttling);

export const octokit = new ThrottledOctokit({
  auth: process.env.GITHUB_TOKEN,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      if (retryCount < 2) return true; // retry twice before giving up
    },
    onSecondaryRateLimit: (_retryAfter, _options, _octokit) => {
      return true; // always retry secondary rate limits
    },
  },
});
```

**GitHub URL extraction with exclusions:**
```typescript
// PITFALL: Non-repo URLs (codeql.github.com, docs.github.com) and font repos must be excluded
const GITHUB_REPO_PATTERN = /^https:\/\/github\.com\/([^\/]+)\/([^\/\?#]+)/;
const EXCLUDED_OWNERS = new Set(['googlefonts']);

export function extractGithubRepo(homepage: string): { owner: string; repo: string } | null {
  const match = homepage.match(GITHUB_REPO_PATTERN);
  if (!match) return null;
  const [, owner, repo] = match;
  if (EXCLUDED_OWNERS.has(owner.toLowerCase())) return null;
  return { owner, repo };
}
```

**GitHub stats fetch with 404 handling (D-04):**
```typescript
export async function fetchGithubStats(
  owner: string,
  repo: string
): Promise<{ stars: number; forks: number; issues: number } | null> {
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}', { owner, repo });
    return {
      stars:  data.stargazers_count,
      forks:  data.forks_count,
      issues: data.open_issues_count,
    };
  } catch (err: unknown) {
    // D-04: 404 or inaccessible → log, return null, set github_enriched=false in caller
    const status = (err as { status?: number }).status;
    if (status === 404 || status === 403) {
      console.warn(`[github] ${owner}/${repo} inaccessible (${status})`);
      return null;
    }
    throw err; // re-throw unexpected errors
  }
}
```

---

### `drizzle.config.ts` (config)

**Source:** Drizzle Kit official docs — https://orm.drizzle.team/docs/drizzle-config-file

**Full config pattern:**
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema:    './src/db/schema.ts',
  out:       './src/db/migrations',
  dialect:   'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Migration commands:**
```bash
# Development: push schema directly (no migration file generated)
npx drizzle-kit push

# Production: generate SQL migration files, then apply at deploy
npx drizzle-kit migrate
```

---

### `vercel.json` (config, event-driven)

**Source:** Vercel official docs — https://vercel.com/docs/cron-jobs/usage-and-pricing (verified 2026-03-04)

**Full cron config pattern:**
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

> Note: `0 6 * * *` = once daily at 06:00 UTC. Matches D-01 (once per day).
> Hobby plan allows once/day max — this schedule is compatible with Hobby.
> If switching to Pro for sub-daily syncs, change schedule to e.g. `0 */6 * * *`.

---

## Shared Patterns

### CRON_SECRET Authentication
**Apply to:** `src/app/api/cron/sync/route.ts` (all future cron route handlers)
```typescript
const authHeader = request.headers.get('authorization');
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response('Unauthorized', { status: 401 });
}
// Perform NO work before this check
```
> This pattern must be the first executable statement in the handler body.
> Generate CRON_SECRET with `openssl rand -hex 32` before first deploy.

### SSRF-Safe Outbound HTTP
**Apply to:** `src/lib/homebrew.ts`, `src/lib/icons.ts`
**Source:** `src/lib/fetch-allowlist.ts` (Pattern 5 above)
```typescript
// Always use safeFetch() from @/lib/fetch-allowlist for all outbound HTTP
// Never call the global fetch() directly in sync job code
import { safeFetch } from '@/lib/fetch-allowlist';
```

### Zod API Response Validation
**Apply to:** `src/lib/homebrew.ts`, `src/lib/github.ts`
**Source:** RESEARCH.md §Validation Architecture
```typescript
// Always validate external API response shapes with Zod before processing
// Reject malformed payloads rather than proceeding with partial data
import { z } from 'zod/v4';
const parsed = SomeSchema.parse(rawJson); // throws ZodError on invalid shape
```

### Drizzle Database Access
**Apply to:** `src/app/api/cron/sync/route.ts` and any future server-side code touching the DB
**Source:** `src/db/index.ts` (Pattern 2 above)
```typescript
import { db } from '@/db';
import { casks } from '@/db/schema';
// Use @/ alias (configured by Next.js App Router) — not relative paths
```

### Environment Variable Access
**Apply to:** All server-side files that need secrets
```typescript
// Access env vars directly — Next.js makes process.env available server-side
// Do NOT log env var values. Do NOT return them in API responses.
const secret = process.env.CRON_SECRET;
const dbUrl = process.env.DATABASE_URL!;       // ! asserts non-null; validated at deploy
const ghToken = process.env.GITHUB_TOKEN;
const blobToken = process.env.BLOB_READ_WRITE_TOKEN; // consumed by @vercel/blob SDK automatically
```

---

## No Analog Found

All 9 files have no existing analog in this greenfield repository. The planner must use the
RESEARCH.md reference implementations (copied verbatim into Pattern Assignments above) as the
baseline for each file.

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/app/api/cron/sync/route.ts` | controller | request-response + batch | First server route in project |
| `src/db/schema.ts` | model | CRUD | First DB schema in project |
| `src/db/index.ts` | config | CRUD | First DB connection in project |
| `src/lib/fetch-allowlist.ts` | utility | request-response | No utilities exist yet |
| `src/lib/homebrew.ts` | service | batch + transform | No services exist yet |
| `src/lib/icons.ts` | service | file-I/O | No file-I/O services exist yet |
| `src/lib/github.ts` | service | request-response | No API client wrappers exist yet |
| `drizzle.config.ts` | config | — | No ORM config exists yet |
| `vercel.json` | config | event-driven | No Vercel config exists yet |

---

## Critical Pitfall Index

The following pitfalls from RESEARCH.md are **code-level** and must be called out in plan actions:

| Pitfall | Affects | Guard |
|---------|---------|-------|
| Analytics not in bulk `cask.json` | `src/lib/homebrew.ts` | Fetch 3 separate analytics endpoints; merge in-memory |
| Comma-formatted count strings `"204,909"` | `src/lib/homebrew.ts` | `parseInt(raw.replace(/,/g, ''), 10)` |
| DuckDuckGo 404 returns PNG body | `src/lib/icons.ts` | Check `res.status !== 200`, not body length |
| `name` field is `string[]` in API | `src/lib/homebrew.ts` | Always use `cask.name[0]` |
| Non-repo GitHub URLs | `src/lib/github.ts` | Regex must match `/github.com/{owner}/{repo}` exactly; exclude `googlefonts` owner |
| `revalidateTag` single-arg deprecated | `src/app/api/cron/sync/route.ts` | Use `revalidateTag('casks', 'max')` — two args required |
| D-02 1-hour sleep exceeds 800s limit | `src/app/api/cron/sync/route.ts` | Single-pass GitHub enrichment (1,083 casks fits in one run; no sleep needed) |
| Initial full seed exceeds 800s | (first run) | Provide `scripts/seed.ts` for local execution; daily cron handles incremental updates |

---

## Metadata

**Analog search scope:** Full repository filesystem
**Source files scanned:** 4 (CLAUDE.md, README.md, LICENSE, .gitignore) — none are source code
**Pattern extraction date:** 2026-05-24
**Pattern sources:** RESEARCH.md §Patterns 1–9, §Code Examples, §Anti-Patterns, §Common Pitfalls
**Valid until:** 2026-06-24 (re-verify if Next.js major version bumps or Homebrew API changes)
