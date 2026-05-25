# Phase 5: Railway Migration - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 8 new/modified files
**Analogs found:** 7 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/index.ts` | config | CRUD | `src/db/index.ts` (self — rewrite) | exact (self) |
| `drizzle.config.ts` | config | batch | `drizzle.config.ts` (self — minor update) | exact (self) |
| `vercel.json` | config | — | `vercel.json` (self — cron removal) | exact (self) |
| `src/app/api/revalidate/route.ts` | route | request-response | `src/app/api/cron/sync/route.ts` | role-match |
| `backend/src/server.ts` | service | request-response | `src/app/api/cron/sync/route.ts` | partial (same logic, different runtime) |
| `backend/src/routes/sync.ts` | route | batch + event-driven | `src/app/api/cron/sync/route.ts` | exact (direct port) |
| `backend/trigger/cron.ts` | utility | event-driven | none in codebase | no analog |
| `backend/tsconfig.json` | config | — | `tsconfig.json` (root) | role-match |

---

## Pattern Assignments

### `src/db/index.ts` (config, CRUD — driver swap)

**Analog:** `src/db/index.ts` (current file being replaced)

**Current pattern** (`src/db/index.ts` lines 1–4):
```typescript
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

**Replacement pattern** (from RESEARCH.md Pattern 3, official drizzle-orm/node-postgres docs):
```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// max: 2 for Vercel serverless — prevents connection exhaustion across cold-start instances
// ssl required for Railway Postgres in production
const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 2,
});

export const db = drizzle({ client: pool, schema });
```

**Key delta:** Import path changes from `drizzle-orm/neon-http` to `drizzle-orm/node-postgres`. A `Pool` is interposed between `DATABASE_URL` and `drizzle()`. The `db` export name is unchanged — all query call sites remain identical.

**Pitfall to avoid:** `max` must be 2 (not 10) for the Vercel/serverless context. The higher pool size (10–20) is only appropriate for the Railway Hono persistent server.

---

### `drizzle.config.ts` (config — dialect already correct, driver hint change)

**Analog:** `drizzle.config.ts` (self — current file)

**Current pattern** (`drizzle.config.ts` lines 1–13):
```typescript
import { config } from 'dotenv';
import type { Config } from 'drizzle-kit';

config({ path: '.env.local' });

export default {
  schema:    './src/db/schema.ts',
  out:       './src/db/migrations',
  dialect:   'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

**Change required:** `dialect: 'postgresql'` is already correct for Railway Postgres. The only change is updating `DATABASE_URL` in `.env.local` to point at the Railway Postgres connection string. No code change is strictly required unless drizzle-kit needs an explicit `driver` hint — confirm with `drizzle-kit push` output.

---

### `vercel.json` (config — cron removal)

**Analog:** `vercel.json` (self — current file)

**Current pattern** (`vercel.json` lines 1–14):
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 6 * * *"
    }
  ],
  "functions": {
    "app/api/cron/sync/route": {
      "maxDuration": 300
    }
  }
}
```

**Change required:** Remove the `crons` array entirely (Railway cron takes over). Remove the `functions.app/api/cron/sync/route` entry (no longer needed; that route may be deleted or left as a no-op). The `$schema` line and any remaining keys stay as-is.

**Result after change:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json"
}
```

---

### `src/app/api/revalidate/route.ts` (route, request-response — NEW)

**Analog:** `src/app/api/cron/sync/route.ts`

**Auth guard pattern** (`src/app/api/cron/sync/route.ts` lines 14–19):
```typescript
export async function GET(request: NextRequest) {
  // CRON_SECRET guard — must be first, before any work
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
```

**Core pattern** (revalidateTag webhook — from RESEARCH.md Pattern 4, official Next.js docs):
```typescript
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

**Notes:**
- Same `CRON_SECRET` bearer check as `sync/route.ts` lines 16–18 — copy verbatim.
- No `maxDuration` export needed — this route executes `revalidateTag` which is synchronous and fast.
- No `import { db }` — this route does NO database work. It is purely a Next.js cache invalidation webhook.
- `Response.json()` (Web API style) is used here rather than `new Response(JSON.stringify(...))` — either works in Next.js App Router but the former is cleaner for a trivial handler.

---

### `backend/src/server.ts` (service, request-response — NEW)

**Analog:** `src/app/api/cron/sync/route.ts` (structural reference only — different runtime)

**Core Hono server pattern** (from RESEARCH.md Pattern 1, official hono.dev/docs):
```typescript
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

**Notes:**
- `PORT` env var is automatically set by Railway — `Number(process.env.PORT) || 3000` is the correct fallback pattern.
- `app.get('/health', ...)` is required for Railway's healthcheck (Railway pings `healthcheckPath` before marking the deploy live).
- No `maxDuration` export — that is a Vercel-only directive; it has no effect in Hono and should be omitted.
- No `import` from `next/*` — this file runs in a plain Node.js process on Railway.

---

### `backend/src/routes/sync.ts` (route, batch + event-driven — NEW)

**Analog:** `src/app/api/cron/sync/route.ts` (direct port — same logic, adapted to Hono context)

**Auth guard pattern** (`src/app/api/cron/sync/route.ts` lines 15–18):
```typescript
const authHeader = request.headers.get("authorization");
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}
```

**Hono equivalent** (adapted from RESEARCH.md Pattern 1):
```typescript
import type { Context } from 'hono';

export async function syncHandler(c: Context) {
  const authHeader = c.req.header('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  // ... sync logic below
}
```

**Env validation pattern** (`src/app/api/cron/sync/route.ts` lines 21–27):
```typescript
const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN"].filter((k) => !process.env[k]);
if (missing.length > 0) {
  return new Response(JSON.stringify({ ok: false, missing }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Hono equivalent** (same logic, `c.json()` replaces `new Response(JSON.stringify(...), {headers})`):
```typescript
const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL_REVALIDATE_URL"]
  .filter((k) => !process.env[k]);
if (missing.length > 0) {
  return c.json({ ok: false, missing }, 500);
}
```

**Core sync body** (`src/app/api/cron/sync/route.ts` lines 29–132):
Copy all logic verbatim from `src/app/api/cron/sync/route.ts` lines 29–132, with these specific adaptations:

1. **Import paths use relative `../../src/` instead of `@/` aliases:**
   ```typescript
   // DO NOT use (broken in backend/):
   import { db } from "@/db";
   import { casks } from "@/db/schema";
   // USE instead:
   import { db } from '../../src/db/index';
   import { casks } from '../../src/db/schema';
   import { extractGithubRepo, fetchGithubStats } from '../../src/lib/github';
   import { fetchHomebrewAnalytics, fetchHomebrewCatalog, mapHomebrewCask } from '../../src/lib/homebrew';
   import { fetchAndStoreIcon } from '../../src/lib/icons';
   ```

2. **Remove `revalidateTag` import and call — replace with HTTP webhook:**
   ```typescript
   // DO NOT import or call:
   // import { revalidateTag } from "next/cache";   // WILL THROW at runtime
   // revalidateTag("casks", "max");

   // INSTEAD, after sync completes, call Vercel revalidation webhook:
   const revalidateUrl = process.env.VERCEL_REVALIDATE_URL!;
   await fetch(revalidateUrl, {
     method: 'GET',
     headers: { Authorization: `Bearer ${process.env.CRON_SECRET}` },
   });
   ```

3. **Remove `export const maxDuration = 300`** — Vercel-only directive; no-op in Hono.

4. **Response style** — use `c.json(...)` instead of `new Response(JSON.stringify(...), {headers})`:
   ```typescript
   // Sync/route.ts pattern (lines 135–138):
   return new Response(JSON.stringify({ ok: true, synced: rows.length, ... }), {
     status: 200,
     headers: { "Content-Type": "application/json" },
   });
   // Hono equivalent:
   return c.json({ ok: true, synced: rows.length, ... }, 200);
   ```

**Error handling pattern** (`src/app/api/cron/sync/route.ts` lines 139–145):
```typescript
} catch (err) {
  console.error("[cron/sync] fatal error", err);
  return new Response(JSON.stringify({ ok: false, error: String(err) }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

**Hono equivalent:**
```typescript
} catch (err) {
  console.error('[sync] fatal error', err);
  return c.json({ ok: false, error: String(err) }, 500);
}
```

---

### `backend/trigger/cron.ts` (utility, event-driven — NEW)

**Analog:** None in the existing codebase. No event-driven trigger scripts exist.

**Pattern from RESEARCH.md Pattern 2** (Railway docs, official cron service model):
```typescript
// backend/trigger/cron.ts
// Railway cron service entry point — calls POST /sync on Hono server and exits
const BACKEND_URL = process.env.BACKEND_INTERNAL_URL!;
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

**Notes:**
- Must call `process.exit(0)` on success and `process.exit(1)` on failure — Railway marks a cron run as succeeded/failed based on exit code.
- `BACKEND_INTERNAL_URL` is set in Railway via variable reference: `http://${{backend.RAILWAY_PRIVATE_DOMAIN}}:3000` — using Railway private networking (no public hop).
- This is a standalone script, not a Hono route — no framework, no `serve()`.

---

### `backend/tsconfig.json` (config — NEW)

**Analog:** `tsconfig.json` (root Next.js tsconfig)

**Root tsconfig pattern** (`tsconfig.json` lines 1–34):
```json
{
  "compilerOptions": {
    "target": "ES2017",
    "module": "esnext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

**backend/tsconfig.json pattern** (from RESEARCH.md Pattern 5):
```jsonc
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

**Key differences from root tsconfig:**
- `"target": "ES2022"` (Railway runs Node.js 24 — modern target is fine; root uses ES2017 for broad browser compat)
- No `"jsx"` or `"plugins": [{ "name": "next" }]` — this is not a Next.js app
- No `"noEmit": true` — outDir is kept if a compile step is ever needed, but `tsx` bypasses it
- `"include"` explicitly covers `src/**/*` and `trigger/**/*` only (not `**/*.tsx` or `.next` artifacts)
- Includes `"@/*": ["../src/*"]` in `paths` for transitive resolution of `src/lib/homebrew.ts`'s `@/db/schema` import (see Pre-flight observation 5)

---

## Shared Patterns

### Bearer Token Auth Guard
**Source:** `src/app/api/cron/sync/route.ts` lines 15–18
**Apply to:** `backend/src/routes/sync.ts`, `src/app/api/revalidate/route.ts`
```typescript
// Next.js (NextRequest) form — use in src/app/api/revalidate/route.ts:
const authHeader = request.headers.get("authorization");
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return new Response("Unauthorized", { status: 401 });
}

// Hono (Context) form — use in backend/src/routes/sync.ts:
const authHeader = c.req.header('authorization');
if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return c.json({ error: 'Unauthorized' }, 401);
}
```
Both use the same `CRON_SECRET` env var name and `Bearer ` prefix. The only difference is the HTTP request accessor (`request.headers.get` vs `c.req.header`).

### JSON Error Response
**Source:** `src/app/api/cron/sync/route.ts` lines 139–145
**Apply to:** `backend/src/routes/sync.ts`
```typescript
// Next.js form (analog in sync/route.ts):
return new Response(JSON.stringify({ ok: false, error: String(err) }), {
  status: 500,
  headers: { "Content-Type": "application/json" },
});

// Hono form (use in backend/):
return c.json({ ok: false, error: String(err) }, 500);
```

### Environment Variable Validation
**Source:** `src/app/api/cron/sync/route.ts` lines 21–27
**Apply to:** `backend/src/routes/sync.ts` (add `VERCEL_REVALIDATE_URL` to the list)
```typescript
const missing = ["DATABASE_URL", "CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN"].filter((k) => !process.env[k]);
```

### Relative Imports Across Directory Boundary
**Apply to:** `backend/src/routes/sync.ts`, `backend/src/server.ts`
The `@/*` alias (`tsconfig.json` line 22: `"@/*": ["./src/*"]`) resolves relative to the repo root and is NOT available inside `backend/`. Use explicit relative paths:
```typescript
import { db } from '../../src/db/index';
import { casks } from '../../src/db/schema';
import { extractGithubRepo, fetchGithubStats } from '../../src/lib/github';
import { fetchHomebrewAnalytics, fetchHomebrewCatalog, mapHomebrewCask } from '../../src/lib/homebrew';
import { fetchAndStoreIcon } from '../../src/lib/icons';
```

### Console Logging Prefix
**Source:** `src/app/api/cron/sync/route.ts` lines 89, 133, 140
**Apply to:** `backend/src/routes/sync.ts`, `backend/trigger/cron.ts`
All log lines use a bracketed module prefix: `console.warn("[cron/sync] icon failed for", ...)`, `console.error("[cron/sync] fatal error", ...)`. Use `[sync]` prefix in the Hono route and `[cron]` in the trigger script to maintain the convention.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `backend/trigger/cron.ts` | utility | event-driven | No event-driven trigger scripts exist in the codebase; pattern sourced from RESEARCH.md (Railway docs) |

---

## Pre-flight Observations for Planner

1. **`vercel.json` already exists** at repo root with a `crons` array pointing at `/api/cron/sync`. Planner must include a task to remove this crons section after Railway cron is live to prevent double-triggering.

2. **`hono` and `@hono/node-server` are already in `package.json` dependencies** (lines 23, 27) and `pg` + `@types/pg` are also already present (lines 28, 22). The `npm install` step for these packages is already done. Planner should note this — the install step is a no-op; only `@neondatabase/serverless` removal remains.

3. **`backend/` directory does not exist yet** — the planner must include directory creation as an explicit step before file creation.

4. **`tsx` is already in devDependencies** (`package.json` line 45) — the Railway start command `npx tsx backend/src/server.ts` does not require a new install.

5. **`src/lib/homebrew.ts` uses `import type { CaskInsertRow } from '@/db/schema'` (line 3)** — this `@/` alias import works when called from Next.js but will break if `homebrew.ts` is imported directly from a backend `tsx` context without a matching tsconfig `paths` entry. The `backend/tsconfig.json` must include `"paths": { "@/*": ["../src/*"] }` or all backend imports of `src/lib/` modules must be tested to ensure the transitive `@/db/schema` import resolves correctly via tsx's esbuild path handling.

6. **`src/app/api/cron/sync/route.ts` uses `GET`, not `POST`** (line 14: `export async function GET`). The Railway cron trigger calls `POST /sync` per D-05 and RESEARCH.md. The Hono route must be `app.post('/sync', syncHandler)`. The existing Next.js route handler method is irrelevant to the Hono port.

---

## Metadata

**Analog search scope:** `src/app/api/`, `src/db/`, `src/lib/`, repo root config files
**Files scanned:** 9 (index.ts, schema.ts, sync/route.ts, drizzle.config.ts, package.json, next.config.ts, tsconfig.json, vercel.json, fetch-allowlist.ts, homebrew.ts, github.ts)
**Pattern extraction date:** 2026-05-25
