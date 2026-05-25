# Phase 5: Railway Migration - Research

**Researched:** 2026-05-25
**Domain:** Railway deployment, Hono HTTP server, node-postgres driver, monorepo configuration, ISR cache invalidation bridge
**Confidence:** HIGH (core stack verified via official docs + npm registry)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Monorepo Layout**
- D-01: Keep the current Next.js app at the repo root (Vercel builds from root — no change to Vercel project settings). Add a `backend/` subdirectory for the Railway service.
- D-02: The `backend/` directory contains a minimal Hono HTTP server (not a Next.js app, not a plain script).
- D-03: DB schema and queries are shared via relative imports from `src/db/` into `backend/`. Single source of truth for schema. The backend's build must resolve paths across the subdirectory boundary (e.g., tsconfig `paths` or relative `../../src/db`).

**Railway Backend Shape**
- D-04: HTTP framework: Hono. TypeScript-native, minimal footprint, familiar handler syntax.
- D-05: Cron trigger: Railway built-in Cron service type. Railway calls `POST /sync` with `Authorization: Bearer <CRON_SECRET>` on the configured schedule. No `node-cron` package needed inside the process.
- D-06: Auth guard: keep the existing `CRON_SECRET` bearer token pattern from the Phase 1 sync route. Same check, same env var name.

**Vercel Blob**
- D-07: Vercel Blob stays as the icon store. The Railway sync job writes to Blob using `BLOB_READ_WRITE_TOKEN` as an env var on the Railway service. No storage migration, no URL changes in the database, no `remotePatterns` changes in Next.js.

**Database Driver + Migration**
- D-08: Replace `@neondatabase/serverless` + `drizzle-orm/neon-http` with the standard `pg` driver + `drizzle-orm/node-postgres` everywhere — both the Next.js frontend (`src/db/index.ts`) and the Railway backend.
- D-09: No dump/restore needed — Neon has no production data. Provision Railway Postgres → run `drizzle-kit push` to create the schema → trigger a full sync to populate from scratch.
- D-10: Single `DATABASE_URL` environment variable, updated in both the Vercel project env and the Railway service env to point at Railway Postgres after cutover.

### Claude's Discretion
- Railway service sleep/wake-on-request config (Railway handles this by default for hobby tier services — planner should enable it if it's not the default)
- `backend/` TypeScript config and build tooling (tsconfig, tsx vs tsc, package.json scripts)
- Railway deployment config (railway.toml or Nixpacks auto-detection)
- Cron schedule for the sync job (was every 6h on Vercel; planner should match or confirm with Railway cron syntax)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

---

## Summary

Phase 5 moves the BrewIndex backend from Vercel/Neon to Railway hobby tier. The work splits into four concerns: (1) provisioning Railway Postgres and replacing the `@neondatabase/serverless` driver with standard `pg` + `drizzle-orm/node-postgres`, (2) building a `backend/` Hono HTTP server that houses the sync logic previously in `src/app/api/cron/sync/route.ts`, (3) wiring Railway's cron scheduler to call `POST /sync` on the Hono server, and (4) bridging the ISR cache invalidation gap that arises because `revalidateTag` is a Next.js-only function that cannot be imported by the Railway process.

The most architecturally significant finding is that `revalidateTag` from `next/cache` cannot be called outside a Next.js process. The sync job on Railway must call a new lightweight Vercel Route Handler (`/api/revalidate`) after sync completes — that handler runs `revalidateTag('casks', 'max')`. This webhook pattern is explicitly documented by Next.js for third-party services. The CRON_SECRET bearer token can guard this endpoint at zero additional config cost.

The second significant finding concerns Railway's cron service model. Railway's cron does NOT make an HTTP call to a running process — it executes the service's start command and expects the process to terminate. D-05 therefore implies a two-service Railway setup: (a) a persistent Hono HTTP server, and (b) a separate lightweight Railway cron service whose start command is `node trigger.js` (or a curl one-liner) that calls `POST /sync` on the Hono service and exits. This is the standard pattern per Railway documentation.

**Primary recommendation:** Implement the `backend/` Hono server as a persistent HTTP service with a `POST /sync` handler; add a separate Railway cron service that invokes it; add a `GET /api/revalidate` webhook on the Vercel frontend to bridge `revalidateTag` back into Next.js.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Homebrew catalog sync + DB upsert | Railway backend (Hono) | — | Long-running background job; exits Vercel's 300s max limit on Pro; belongs on Railway persistent service |
| Icon fetch + Vercel Blob upload | Railway backend (Hono) | — | Sync job is the only writer; runs at sync time, not per-request |
| GitHub enrichment | Railway backend (Hono) | — | Rate-limited sequential pass; same as icon pipeline, runs at sync time |
| Cron scheduling | Railway Cron service | — | Railway built-in scheduler; fires start command on UTC schedule |
| ISR cache invalidation | Vercel Next.js (Route Handler) | Railway backend (caller) | `revalidateTag` is Next.js-only; Railway calls webhook, Vercel executes |
| Postgres database | Railway Postgres service | — | Standard Postgres; provisioned fresh via `drizzle-kit push` |
| Browse/search pages (read-only) | Vercel (ISR pages) | Railway Postgres (data source) | Static-first, CDN-cached; queries Railway Postgres via DATABASE_URL |
| Blob icon storage | Vercel Blob | Railway backend (writer) | URLs don't change; already in schema as `icon_url` |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `hono` | 4.12.23 | HTTP server framework for Railway backend | TypeScript-native, zero-dependency, fastest cold-start among Node.js frameworks; D-04 locked |
| `@hono/node-server` | 2.0.4 | Node.js adapter for Hono | Required to run Hono on Node.js (`serve()` function); maintained by Hono team |
| `pg` | 8.21.0 | node-postgres driver | Standard Postgres driver for Node.js; D-08 locked replacement for `@neondatabase/serverless` |
| `drizzle-orm` | 0.45.2 | ORM (already installed) | `drizzle-orm/node-postgres` import replaces `drizzle-orm/neon-http`; queries unchanged |
| `tsx` | 4.22.3 | TypeScript execution (already in devDeps) | Runs `.ts` files directly without a compile step; used for both dev and Railway start command |

[VERIFIED: npm registry — confirmed via `npm view` 2026-05-25]

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@types/pg` | 8.20.0 | TypeScript types for `pg` | Required with `pg` when using TypeScript |
| `dotenv` | 17.4.2 | `.env` loading (already in devDeps) | `drizzle.config.ts` already uses it; backend dev server also needs it |

[VERIFIED: npm registry — confirmed via `npm view` 2026-05-25]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `tsx` for start command | `tsc` compile + `node dist/` | `tsx` is simpler for a small backend with no build artifact requirements; `tsc` produces a compiled output Railway could run as `node dist/server.js`, but adds a build step and `outDir` config |
| Separate Railway cron service | `node-cron` inside Hono process | D-05 locked to Railway built-in cron. `node-cron` inside the Hono process is explicitly ruled out |
| Webhook to Vercel `/api/revalidate` | Skip ISR invalidation | Skipping means the frontend serves stale data indefinitely until the next natural cache miss. The webhook is the correct pattern |

**Installation (root package.json additions):**
```bash
npm install pg
npm install --save-dev @types/pg
npm install hono @hono/node-server
```

**Note:** `@neondatabase/serverless` is removed after driver switch is verified working.

---

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `hono` | npm | ~3.5 yrs (Dec 2021) | 39.2M/wk | github.com/honojs/hono | [OK] | Approved |
| `@hono/node-server` | npm | ~2.4 yrs (Jan 2023) | 34.0M/wk | github.com/honojs/node-server | [OK] | Approved |
| `pg` | npm | ~15 yrs (Dec 2010) | 30.8M/wk | github.com/brianc/node-postgres | [OK] | Approved |
| `@types/pg` | npm | well-established | 40.7M/wk | DefinitelyTyped | [OK] | Approved |
| `drizzle-orm` | npm | already installed | — | drizzle-team/drizzle-orm | [OK] | Already present |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck v available at research time — all packages passed [OK].*

---

## Architecture Patterns

### System Architecture Diagram

```
[GitHub Actions / git push]
         |
         v
[Vercel (root)] ←──────────────────────────────┐
  Next.js App Router (ISR)                      │  POST /api/revalidate
  - Browse pages (ISR cached)                   │  Bearer CRON_SECRET
  - Detail pages (ISR cached, top-500 pre-built)│
  - API: GET /api/revalidate (webhook)          │
         |  reads                               │
         v                                      │
[Railway Postgres]          [Railway: Hono HTTP] ─────┘
  Standard Postgres           POST /sync
  DATABASE_URL                  | after sync completes
  (shared by both tiers)        | calls webhook
         ^                      |
         | upserts              |
[Railway: Cron Service]         |
  start: node trigger.js        |
  schedule: 0 */6 * * *        |
  HTTP POST → Hono /sync ───────┘

[Vercel Blob] ←── BLOB_READ_WRITE_TOKEN ── Railway Hono writes icons
  *.public.blob.vercel-storage.com
  (read by both Vercel Next.js and Railway Hono)
```

### Recommended Project Structure
```
(repo root)
├── src/                         # Next.js app (unchanged)
│   ├── app/                     # App Router pages + Route Handlers
│   │   └── api/
│   │       └── revalidate/      # NEW: ISR webhook (GET handler)
│   │           └── route.ts
│   ├── db/
│   │   ├── index.ts             # CHANGED: neon-http → node-postgres
│   │   └── schema.ts            # UNCHANGED (shared source of truth)
│   └── lib/                     # UNCHANGED (reused by backend via relative path)
├── backend/                     # NEW: Railway Hono server
│   ├── package.json             # backend-only scripts; may re-export root deps
│   ├── tsconfig.json            # target: ES2022, moduleResolution: bundler
│   ├── railway.toml             # startCommand, cronSchedule, healthcheckPath
│   ├── src/
│   │   ├── server.ts            # Hono app + serve()
│   │   └── routes/
│   │       └── sync.ts          # POST /sync — ported from src/app/api/cron/sync/route.ts
│   └── trigger/
│       └── cron.ts              # Railway cron service entry point (calls POST /sync, exits)
├── drizzle.config.ts            # CHANGED: dialect already postgresql; url from env
├── package.json                 # ADD: pg, @hono/node-server, hono; REMOVE: @neondatabase/serverless
└── tsconfig.json                # UNCHANGED (Next.js root config)
```

### Pattern 1: Hono HTTP Server with CRON_SECRET Guard

**What:** Minimal Hono server on Railway that exposes `POST /sync` protected by bearer token auth.
**When to use:** The Hono persistent service. This is the PRIMARY service that does the sync work.

```typescript
// backend/src/server.ts
// Source: https://hono.dev/docs/getting-started/nodejs (official docs)
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { syncHandler } from './routes/sync';

const app = new Hono();

app.post('/sync', syncHandler);
app.get('/health', (c) => c.json({ ok: true }));

serve({
  fetch: app.fetch,
  port: Number(process.env.PORT) || 3000,
});
```

```typescript
// backend/src/routes/sync.ts — adapted from src/app/api/cron/sync/route.ts
// Source: existing codebase pattern (CRON_SECRET guard preserved verbatim)
import type { Context } from 'hono';
import { db } from '../../src/db/index';  // relative import across boundary (D-03)

export async function syncHandler(c: Context) {
  const authHeader = c.req.header('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  // ... same sync logic as src/app/api/cron/sync/route.ts
  // EXCEPTION: replace revalidateTag() call with HTTP webhook to Vercel
}
```

### Pattern 2: Railway Cron Service — HTTP Trigger Script

**What:** A separate, minimal Railway cron service whose start command calls `POST /sync` on the Hono service and exits with code 0 or 1.
**When to use:** This service is configured with `cronSchedule: "0 */6 * * *"` in Railway settings.

```typescript
// backend/trigger/cron.ts
// Runs on Railway cron schedule; must exit after calling /sync
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL!; // Railway private network URL
const CRON_SECRET = process.env.CRON_SECRET!;

async function trigger() {
  const res = await fetch(`${BACKEND_URL}/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  if (!res.ok) {
    console.error('[cron] sync failed', res.status, await res.text());
    process.exit(1);
  }
  console.log('[cron] sync triggered', await res.json());
  process.exit(0);
}

trigger().catch((err) => {
  console.error('[cron] trigger error', err);
  process.exit(1);
});
```

**railway.toml for the cron service:**
```toml
[deploy]
startCommand = "npx tsx backend/trigger/cron.ts"
cronSchedule = "0 */6 * * *"
```

### Pattern 3: Drizzle node-postgres Driver Swap

**What:** Replace `drizzle-orm/neon-http` with `drizzle-orm/node-postgres`. Import path changes; query API is identical.
**When to use:** `src/db/index.ts` (serves Next.js) AND `backend/src/db.ts` (or shared via relative import per D-03).

```typescript
// src/db/index.ts — AFTER migration (D-08)
// Source: https://orm.drizzle.team/docs/get-started/postgresql-new (official docs)
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

// Pool is recommended for server apps; Next.js serverless functions can use Pool
// with a small max pool size (2-5) to avoid connection exhaustion
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 5,
});

export const db = drizzle({ client: pool, schema });
```

**Important:** The `ssl` option is required for Railway Postgres in production. Railway's Postgres connection string may include `?sslmode=require` — if so, `pg` reads it automatically. Test both.

### Pattern 4: ISR Revalidation Webhook on Vercel

**What:** A new Vercel Route Handler that the Railway sync job calls after completing a sync. It runs `revalidateTag` within the Next.js process where it's valid.
**When to use:** Railway Hono `syncHandler` calls this endpoint at the end of a successful sync.

```typescript
// src/app/api/revalidate/route.ts — NEW file on Vercel frontend
// Source: https://nextjs.org/docs/app/api-reference/functions/revalidateTag (official docs)
import { revalidateTag } from 'next/cache';
import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  revalidateTag('casks', 'max');
  return Response.json({ revalidated: true, now: Date.now() });
}
```

Then in the Railway Hono sync route (at end of syncHandler):
```typescript
// After sync completes — call Vercel revalidation webhook
const revalidateUrl = process.env.VERCEL_REVALIDATE_URL!; // e.g. https://brewindex.vercel.app/api/revalidate
await fetch(revalidateUrl, {
  method: 'GET',
  headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
});
```

### Pattern 5: backend/ TypeScript Configuration

**What:** `backend/tsconfig.json` that allows importing from `../../src/db/` (crossing the directory boundary per D-03).
**When to use:** The backend's own build/execution context.

```jsonc
// backend/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "./dist"
  },
  "include": ["src/**/*", "trigger/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Note:** `tsx` does not need `tsconfig.json` to execute — it uses esbuild internally and handles cross-directory relative imports natively. The tsconfig is primarily for IDE type-checking and for `tsc --noEmit` validation.

### Anti-Patterns to Avoid

- **Importing `revalidateTag` from `next/cache` in the Railway process:** It is a Next.js-only function. Importing it outside Next.js will throw at runtime. Always call the Vercel webhook instead.
- **Using `@neondatabase/serverless` on Railway:** The Neon HTTP driver bypasses TCP and only works correctly on serverless/edge runtimes. On a Railway Node.js container with a persistent TCP connection, it works but adds unnecessary network hop. Replace with `pg` as per D-08.
- **Running a cron schedule on the persistent Hono HTTP service directly:** Railway documents that cron services must "execute a task and exit." A persistent web server never exits. The cron scheduler must be a separate service.
- **Using `@alias` imports (`@/db`) in `backend/` files:** The `@/*` path alias resolves to `./src/*` via `tsconfig.json` in the repo root. `tsx` in `backend/` does not automatically pick up the root tsconfig. Use relative paths (`../../src/db/index`) instead, or configure a `backend/tsconfig.json` with matching `paths`.
- **Omitting SSL on the Railway Postgres connection:** Railway Postgres requires SSL in production. A missing `ssl` option causes `connection refused` or silent failures on first query.
- **Importing `next/server` or `next/cache` in shared `src/lib/` modules:** The Railway backend reuses `src/lib/homebrew.ts`, `src/lib/github.ts`, `src/lib/icons.ts`, and `src/lib/fetch-allowlist.ts`. These files must not import anything from `next/*`. Currently they do not — keep it that way.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Railway Cron scheduling | `node-cron` inside Hono process | Railway built-in cron (D-05 locked) | Railway cron is free, zero-config, survives deploys; `node-cron` state is lost on restart |
| Postgres connection pooling | Manual TCP reconnect logic | `pg.Pool` with `max: 5` | pg's Pool handles reconnect, idle timeout, and error recovery; hand-rolled reconnect misses edge cases |
| TypeScript execution on Railway | `tsc` compile → `node dist/` CI pipeline | `tsx backend/src/server.ts` as start command | For a small backend, `tsx` eliminates build artifacts and a CI compile step; identical behavior |
| ISR cache invalidation from Railway | Poll Vercel deploy API or time-based revalidate only | `GET /api/revalidate` webhook + `revalidateTag` | Webhook is the official Next.js pattern for external invalidation; polling adds latency and API calls |

**Key insight:** Railway's value is in managed infrastructure (Postgres, cron, networking). Use its primitives rather than implementing scheduling or connection management inside the application.

---

## Common Pitfalls

### Pitfall 1: `revalidateTag` Import Outside Next.js

**What goes wrong:** `backend/src/routes/sync.ts` imports `import { revalidateTag } from 'next/cache'` and throws `Error: revalidateTag cannot be used outside of Next.js` at runtime.
**Why it happens:** `next/cache` uses global Node.js request context that only exists inside a Next.js server process. Railway runs a plain Node.js process.
**How to avoid:** Never import `next/cache` in `backend/`. Add a `GET /api/revalidate` route to the Vercel app and call it via `fetch()` after sync completes (Pattern 4 above).
**Warning signs:** Build succeeds but sync route crashes on first call; error message contains "revalidateTag cannot be called outside of Next.js".

### Pitfall 2: Missing SSL on Railway Postgres Connection

**What goes wrong:** `db.select()` fails with `Error: self-signed certificate` or `Error: connect ECONNREFUSED` when hitting Railway Postgres from a Node.js `pg.Pool`.
**Why it happens:** Railway Postgres requires SSL. `pg` defaults to no SSL. Neon's HTTP driver included SSL by default; `pg` does not.
**How to avoid:** Set `ssl: { rejectUnauthorized: false }` in the Pool config, OR ensure `DATABASE_URL` includes `?sslmode=require` which `pg` respects automatically. Test with `drizzle-kit push` first — it will fail early with the same error.
**Warning signs:** Sync runs locally fine (local Postgres, no SSL) but fails on Railway; error is SSL-related.

### Pitfall 3: `@/db` Alias Broken in `backend/`

**What goes wrong:** `import { db } from '@/db'` in `backend/src/routes/sync.ts` throws `Cannot find module '@/db'` at runtime.
**Why it happens:** The `@/*` path alias is defined in the root `tsconfig.json` under `compilerOptions.paths`. `tsx` in `backend/` does not load the root tsconfig by default.
**How to avoid:** Use relative imports: `import { db } from '../../src/db/index'`. Or configure `backend/tsconfig.json` with `"paths": { "@/*": ["../src/*"] }` and ensure `tsx` loads it via `tsx --tsconfig backend/tsconfig.json`.
**Warning signs:** Module not found errors at startup, specifically on `@/` prefixed imports.

### Pitfall 4: Railway Cron Service Skips Runs Due to Active Deployment

**What goes wrong:** Railway cron fires, but the previous sync is still running (sync takes ~5-10 min). Railway silently skips the new trigger.
**Why it happens:** Railway will not start a new cron execution if the previous one is still active. For the cron TRIGGER service (the tiny `trigger/cron.ts` script), this is irrelevant — it calls `/sync` and exits immediately. For the Hono server, it means only one sync runs at a time naturally.
**How to avoid:** The cron trigger script exits in < 1 second after firing the HTTP request. The Hono server accepts the next trigger when ready. No special handling needed, but set cron interval (6h) much longer than max sync duration (~5-10 min).
**Warning signs:** Cron shows `ACTIVE` for longer than expected; Railway logs show "Skipped due to active deployment".

### Pitfall 5: `maxDuration = 300` is Vercel-Specific

**What goes wrong:** The `export const maxDuration = 300` in the current `route.ts` is a Vercel Route Handler directive. It does nothing (and is invalid syntax) in a Hono route.
**Why it happens:** It was added in Phase 1 for Vercel Pro plan maximum function duration. Railway has no equivalent — Railway services run until the process exits, with no built-in timeout.
**How to avoid:** Remove `maxDuration` from the Hono sync handler. Railway's HTTP request timeout is configurable via `RAILWAY_HEALTHCHECK_TIMEOUT_SEC` but does not apply to regular endpoints.
**Warning signs:** TypeScript might not catch this as an error; it just has no effect in Hono.

### Pitfall 6: Connection Pool Exhaustion on Vercel (Serverless)

**What goes wrong:** After switching from Neon HTTP driver to `pg.Pool`, Vercel serverless functions create a new pool per cold start and exhaust Railway Postgres's connection limit (~100 concurrent connections).
**Why it happens:** Neon HTTP driver was stateless (one HTTP request per query). `pg.Pool` holds persistent TCP connections. Each Vercel function instance creates its own pool.
**How to avoid:** Set `max: 5` (or lower, e.g., 2) in the Pool config for `src/db/index.ts` used by Vercel Next.js. This caps connections per instance. For the Railway Hono server (persistent, single instance), a higher max (10-20) is fine.
**Warning signs:** `Error: remaining connection slots are reserved for non-replication superuser connections` in Vercel function logs.

### Pitfall 7: Vercel Build Fails After Removing `@neondatabase/serverless`

**What goes wrong:** After removing `@neondatabase/serverless` from `package.json`, the Vercel build fails if `drizzle-orm/neon-http` is still imported anywhere.
**Why it happens:** `drizzle-orm/neon-http` peer-depends on `@neondatabase/serverless`. Removing the package breaks the import.
**How to avoid:** Update `src/db/index.ts` to `drizzle-orm/node-postgres` BEFORE removing `@neondatabase/serverless` from `package.json`. Verify `grep -r "neon-http\|neondatabase" src/` returns empty.
**Warning signs:** Vercel build log shows `Cannot find module '@neondatabase/serverless'`.

---

## Critical Finding: Railway Cron Architecture (Two-Service Model)

D-05 states "Railway calls `POST /sync` with `Authorization: Bearer <CRON_SECRET>`". This is accurate, but the mechanism requires clarification for the planner.

**How Railway cron actually works** [VERIFIED: docs.railway.com/guides/cron-jobs]:
Railway's cron service executes the service's **start command** on schedule. It does NOT make an HTTP request to a running server. A persistent HTTP server (Hono) must never exit — so it cannot be the cron service itself.

**The correct two-service model on Railway:**

| Service | Type | Role |
|---------|------|------|
| `backend` | Persistent (web service) | Hono HTTP server with `POST /sync`; always running |
| `cron-trigger` | Cron service | start command: `npx tsx backend/trigger/cron.ts`; runs on schedule, calls `/sync`, exits |

Both services live in the same Railway project. The cron service uses Railway's internal private networking to call the backend service (no public network hop).

**Railway private networking URL:** Services within the same Railway project communicate via `${{backend.RAILWAY_PRIVATE_DOMAIN}}:3000`. The cron trigger sets `BACKEND_URL = ${{backend.RAILWAY_PRIVATE_DOMAIN}}:3000` via Railway variable reference syntax.

---

## Runtime State Inventory

This is a migration phase. The following runtime state must be handled:

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Neon Postgres — no production data (D-09 confirmed) | None; Railway Postgres provisioned fresh, `drizzle-kit push` creates schema |
| Live service config | Vercel project env vars: `DATABASE_URL`, `CRON_SECRET`, `GITHUB_TOKEN`, `BLOB_READ_WRITE_TOKEN` | After cutover: update `DATABASE_URL` in Vercel to point at Railway Postgres |
| OS-registered state | Vercel Cron Job defined in `vercel.json` (if exists) | Remove after Railway cron is live; check for `vercel.json` cron config |
| Secrets/env vars | `DATABASE_URL` — new value after Railway Postgres provisioned; all other vars unchanged | Update in Vercel dashboard + Railway service env |
| Build artifacts | None — serverless functions, no compiled artifacts | None |

**Nothing found in category:** Build artifacts — verified by project structure (no `/dist` or compiled output in repo).

Note: Check for `vercel.json` in repo root — if it contains a `crons` section, it must be removed after migration to avoid double-triggering sync.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Railway backend runtime | ✓ (local) | 24.11.0 | — |
| npm | Package management | ✓ | 11.6.1 | — |
| Railway CLI | Deploying + env var management | Not checked | — | Use Railway dashboard UI |
| `drizzle-kit push` | Schema creation on Railway Postgres | ✓ (in devDeps) | 0.31.10 | — |
| Railway Postgres | Database | Not provisioned yet | — | Must provision before drizzle-kit push |
| Vercel Blob | Icon storage | ✓ (existing) | — | Already live from Phase 1 |

**Missing dependencies with no fallback:**
- Railway Postgres instance — must be provisioned in Railway dashboard before drizzle-kit push can run.

**Missing dependencies with fallback:**
- Railway CLI — all operations can be done via Railway dashboard UI alternatively.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `drizzle-orm/neon-http` | `drizzle-orm/node-postgres` | Phase 5 (now) | Switches from HTTP-based stateless queries to persistent TCP pool; SSL config required |
| `@neondatabase/serverless` | `pg` | Phase 5 (now) | Standard Postgres driver; works on any Node.js runtime including Railway |
| Vercel Cron Jobs | Railway built-in cron scheduler | Phase 5 (now) | Vercel Hobby = once/day; Railway = any interval ≥ 5 min; same CRON_SECRET auth |
| `revalidateTag` called inside sync route | HTTP webhook to Vercel `/api/revalidate` | Phase 5 (now) | `revalidateTag` is Next.js-internal; must be triggered from within Next.js process |
| Nixpacks (old Railway builder) | Railpack (new default) | 2024 | Railway auto-detects; `railway.toml` `[build] builder = "RAILPACK"` is implicit |

**Deprecated/outdated:**
- `drizzle-orm/neon-http`: Still valid for Neon HTTP connections but not appropriate for Railway Postgres over TCP.
- Vercel KV / `@vercel/kv`: Deprecated December 2024 (not used in this project, but noted per CLAUDE.md).
- The `export const maxDuration = 300` directive in `route.ts`: Vercel-only; remove from Hono handler.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Railway Postgres connection string includes `?sslmode=require` (or equivalent SSL enforcement) requiring `ssl: { rejectUnauthorized: false }` in pg.Pool | Pitfall 2, Pattern 3 | If Railway Postgres does NOT require SSL (unlikely), the ssl option is harmless. If it DOES require SSL and it's omitted, sync fails entirely. Low risk — include ssl option defensively. |
| A2 | Railway's internal private networking URL for cross-service calls follows `${{service-name.RAILWAY_PRIVATE_DOMAIN}}` syntax | Critical Finding section | If syntax differs, cron trigger cannot call Hono service over private network. Fallback: use the public Railway domain URL for the Hono service. Slightly higher latency but functionally equivalent. |
| A3 | `tsx` correctly resolves relative imports across `backend/` → `../../src/` boundary without additional config | Pattern 5, Anti-patterns | If tsx cannot resolve the cross-directory relative path, sync handler cannot import `src/db/index`. Mitigation: test locally before deploying. |

---

## Open Questions (RESOLVED)

1. **Does a `vercel.json` with cron config exist?**
   - What we know: The Phase 1 cron was added as a Vercel Route Handler with `export const maxDuration`. There may or may not be a `vercel.json` defining the cron schedule.
   - What's unclear: `ls` shows no `vercel.json` at repo root — but it may be configured in the Vercel dashboard rather than as code.
   - Recommendation: Planner should add a task to check the Vercel dashboard for cron config and remove it after Railway cron is live.
   - RESOLVED: Yes, `vercel.json` exists at repo root with a `crons` array; handled in Plan 04 Task 1 (removes the crons array from vercel.json).

2. **Should `src/db/index.ts` use `Pool` (shared) or a fresh `Client` per-request for Next.js serverless?**
   - What we know: Neon HTTP was stateless (one HTTPS request per query, no connection state). `pg.Pool` holds persistent TCP connections. Vercel serverless functions can hold pool connections across warm instances.
   - What's unclear: Whether 5-connection pool cap is sufficient or whether a 1-connection limit (Client per request) is safer for Vercel's ephemeral function model.
   - Recommendation: Start with `Pool { max: 2 }` for the Vercel Next.js context. The Railway Hono server (persistent, single process) can use `Pool { max: 10 }`.
   - RESOLVED: Pool with `max: 2`, per Plan 01 Task 1.

3. **Does Railway's `revalidateTag` need a `VERCEL_REVALIDATE_URL` env var pointing at the production Vercel domain?**
   - What we know: The Hono sync handler needs to call back to the Vercel frontend's `/api/revalidate`. The URL is deployment-dependent.
   - What's unclear: Whether to hardcode the production Vercel URL or use an env var.
   - Recommendation: Use `VERCEL_REVALIDATE_URL` as an env var on the Railway service to avoid hardcoding the Vercel domain. Set it to `https://<project>.vercel.app/api/revalidate` or the custom domain.
   - RESOLVED: Yes, `VERCEL_REVALIDATE_URL` env var is used; set on the Railway backend service per Plan 03 Task 2.

---

## Sources

### Primary (HIGH confidence)
- `docs.railway.com/guides/cron-jobs` — cron execution model (start command, not HTTP call; exits required)
- `docs.railway.com/reference/config-as-code` — railway.toml schema (cronSchedule, startCommand, healthcheckPath)
- `docs.railway.com/guides/monorepo` — Root Directory setting; watch paths; absolute path for config file
- `docs.railway.com/guides/postgresql` — DATABASE_URL format; variable reference syntax `${{Postgres.DATABASE_URL}}`
- `docs.railway.com/reference/variables` — Cross-service variable reference: `${{NAMESPACE.VAR}}`
- `docs.railway.com/reference/app-sleeping` — Sleep behavior (10 min idle); wake on incoming traffic; not default
- `docs.railway.com/guides/public-networking` — `.railway.app` subdomain; generate domain flow
- `docs.railway.com/guides/healthchecks` — healthcheckPath behavior; 300s default timeout
- `hono.dev/docs/getting-started/nodejs` — `@hono/node-server` serve() pattern; PORT env var
- `orm.drizzle.team/docs/get-started/postgresql-new` — `drizzle-orm/node-postgres` import + Pool setup
- `nextjs.org/docs/app/api-reference/functions/revalidateTag` — revalidateTag signature; webhook pattern for external services
- npm registry — confirmed versions: hono@4.12.23, @hono/node-server@2.0.4, pg@8.21.0, @types/pg@8.20.0 (2026-05-25)
- slopcheck — all 5 packages passed [OK] (2026-05-25)

### Secondary (MEDIUM confidence)
- `railpack.com/languages/node` — Railpack Node.js auto-detection; `start` script in package.json is highest priority; `index.ts` as fallback
- `docs.railway.com/reference/pricing/plans` — Hobby plan $5/mo with $5 credit; 48 GB RAM / 48 vCPU per service limits

### Tertiary (LOW confidence — need validation)
- Railway private networking URL syntax `${{backend.RAILWAY_PRIVATE_DOMAIN}}` — documented in variables guide but exact format may differ per project; validate in Railway dashboard.

---

## Metadata

**Confidence breakdown:**
- Standard stack (pg, hono, drizzle-orm): HIGH — all packages verified via npm registry + slopcheck; official docs confirmed
- Railway architecture (two-service cron model): HIGH — verified from official Railway cron docs
- ISR revalidation webhook pattern: HIGH — verified from official Next.js revalidateTag docs
- SSL configuration for Railway Postgres: MEDIUM — Railway docs confirm SSL-enabled Postgres image; exact pg.Pool ssl config is assumed safe
- Cross-directory import resolution with tsx: MEDIUM — tsx (esbuild-based) handles this in practice; not explicitly tested

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (Railway config-as-code schema; Hono API; both stable)
