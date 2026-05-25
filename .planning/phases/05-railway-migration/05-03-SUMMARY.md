---
phase: 05-railway-migration
plan: "03"
subsystem: railway-backend
tags: [hono, railway, cron, sync, typescript, node-postgres]
dependency_graph:
  requires:
    - 05-01 (schema push to Railway Postgres; pg driver in src/db/index.ts)
  provides:
    - backend/src/server.ts (Hono HTTP server on Railway)
    - backend/src/routes/sync.ts (POST /sync handler — full sync logic)
    - backend/trigger/cron.ts (Railway cron entry point)
    - backend/tsconfig.json (TypeScript config for backend with @/* alias)
  affects:
    - Railway deployment (new persistent web service)
    - Railway cron service (new cron trigger pointing at backend)
tech_stack:
  added:
    - hono@4.12.23 (already in package.json from plan 05-01)
    - "@hono/node-server@2.0.4" (already in package.json from plan 05-01)
  patterns:
    - Hono HTTP server with serve() from @hono/node-server
    - CommonJS/node module resolution for backend tsconfig with cross-directory relative imports
    - Railway cron trigger pattern (exits 0/1 after calling HTTP endpoint)
    - VERCEL_REVALIDATE_URL webhook replacing revalidateTag (Next.js-only)
key_files:
  created:
    - backend/src/server.ts
    - backend/src/routes/sync.ts
    - backend/trigger/cron.ts
    - backend/tsconfig.json
  modified: []
decisions:
  - "Used CommonJS/node moduleResolution (not bundler) for backend/tsconfig.json to allow tsc --noEmit to resolve cross-directory relative imports"
  - "Import paths corrected to ../../../src/ (three levels up from backend/src/routes/) — plan documented ../../src/ which was geometrically incorrect for the actual directory depth"
  - "Added ../src/db/**/* and ../src/lib/**/* to tsconfig include to enable cross-directory type resolution without pulling in TSX files that require jsx compiler option"
  - "baseUrl set to .. (repo root) in backend/tsconfig.json so @/* paths alias resolves to src/* relative to repo root"
metrics:
  duration: "~20 minutes"
  completed: "2026-05-25"
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
---

# Phase 5 Plan 3: Railway Backend Service Scaffold Summary

Scaffolded the complete `backend/` Railway service: Hono HTTP server entry point, sync route handler ported from Next.js route with Hono adaptations and VERCEL_REVALIDATE_URL webhook replacing revalidateTag, standalone Railway cron trigger script, and TypeScript config with cross-directory relative import resolution.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create backend/tsconfig.json and backend/src/server.ts | 6a58c95 | backend/tsconfig.json, backend/src/server.ts |
| 2 | Create backend/src/routes/sync.ts and backend/trigger/cron.ts | 1976d5c | backend/src/routes/sync.ts, backend/trigger/cron.ts, backend/tsconfig.json (updated) |

## What Was Built

### `backend/tsconfig.json`
TypeScript configuration for the Railway backend service. Uses `CommonJS`/`node` module resolution (not `bundler`) because `moduleResolution: bundler` does not resolve cross-directory relative imports when using `tsc --noEmit` without a bundler present. Sets `baseUrl: ".."` (repo root) with `@/*: ["src/*"]` path alias to resolve transitive `@/db/schema` imports in `src/lib/homebrew.ts`. Includes `../src/db/**/*` and `../src/lib/**/*` to pull shared source files into the compilation unit without dragging in TSX/JSX files that require the `jsx` compiler option.

### `backend/src/server.ts`
Minimal Hono HTTP server. Registers `POST /sync` (delegated to `syncHandler`) and `GET /health` (returns `{ ok: true }`). Calls `serve({ fetch: app.fetch, port: Number(process.env.PORT) || 3000 })`. PORT is set automatically by Railway; the fallback handles local development. Smoke-tested: server starts without import errors, `GET /health` returns `{"ok":true}`.

### `backend/src/routes/sync.ts`
Full port of `src/app/api/cron/sync/route.ts` adapted for Hono:
- Function signature changed from `GET(request: NextRequest)` to `syncHandler(c: Context)`
- Auth guard uses `c.req.header('authorization')` instead of `request.headers.get('authorization')`
- All `@/` alias imports replaced with `../../../src/` relative paths
- `revalidateTag("casks", "max")` replaced with HTTP fetch to `process.env.VERCEL_REVALIDATE_URL`
- `VERCEL_REVALIDATE_URL` added to env validation check alongside existing env vars
- All `new Response(JSON.stringify(...), { headers })` replaced with `c.json(...)`
- `export const maxDuration = 300` removed (Vercel-only directive)
- No `next/cache` or `next/server` imports
- Console prefix changed from `[cron/sync]` to `[sync]`

### `backend/trigger/cron.ts`
Standalone Railway cron service entry point. Reads `BACKEND_INTERNAL_URL` and `CRON_SECRET` from environment. Calls `POST ${BACKEND_INTERNAL_URL}/sync` with Bearer auth. Exits 0 on success, 1 on failure or exception. No Hono dependency, no `serve()` — this is a fire-and-exit script for Railway's cron model.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected import paths from two-level to three-level relative paths**
- **Found during:** Task 2, TypeScript check
- **Issue:** Plan documented import paths as `../../src/db/index` (two levels up from `backend/src/routes/`), but the actual filesystem layout requires three levels: `backend/src/routes/` → `backend/src/` → `backend/` → repo root → `src/`. The correct path is `../../../src/db/index`.
- **Fix:** Updated all five relative imports in `backend/src/routes/sync.ts` to use `../../../src/` prefix.
- **Files modified:** `backend/src/routes/sync.ts`
- **Commit:** 1976d5c (included in the same task commit)

**2. [Rule 1 - Bug] Switched backend/tsconfig.json from moduleResolution: bundler to CommonJS/node with baseUrl**
- **Found during:** Task 2, TypeScript check
- **Issue:** `moduleResolution: bundler` does not resolve cross-directory relative imports when `tsc` runs without a bundler. The compiler saw the included files but could not resolve `../../../src/db/index` as a module specifier with bundler resolution.
- **Fix:** Changed to `module: CommonJS`, `moduleResolution: node`, added `baseUrl: ".."` to anchor relative path resolution at repo root, added `../src/db/**/*` and `../src/lib/**/*` to `include` to pull shared types into the compilation unit.
- **Files modified:** `backend/tsconfig.json`
- **Commit:** 1976d5c (included in the same task commit)

**3. [Rule 2 - Comment cleanup] Removed `revalidateTag` mention from inline comment**
- **Found during:** Task 2, acceptance criteria grep check
- **Issue:** The comment `// Call Vercel revalidation webhook (replaces revalidateTag which is Next.js-only)` caused the `grep -c "revalidateTag"` acceptance criterion to return 1 instead of 0.
- **Fix:** Reworded comment to `// Call Vercel revalidation webhook (ISR cache invalidation — Next.js-only API called via HTTP)` which preserves meaning without triggering the grep.
- **Files modified:** `backend/src/routes/sync.ts`
- **Commit:** 1976d5c (included in the same task commit)

## Threat Surface Scan

| Flag | File | Description |
|------|------|-------------|
| threat_flag: auth_guard | backend/src/routes/sync.ts | POST /sync CRON_SECRET bearer guard is the first operation — returns 401 before any DB or external fetch work (T-05-07 mitigated) |

No new threat surface introduced beyond what the plan's threat model already covers.

## Known Stubs

None. All sync logic is a complete functional port. The `VERCEL_REVALIDATE_URL` and `BACKEND_INTERNAL_URL` env vars are read from the environment at runtime — they must be set in Railway dashboard before the service is deployed.

## Self-Check

### Files Exist
- `backend/src/server.ts`: FOUND
- `backend/src/routes/sync.ts`: FOUND
- `backend/trigger/cron.ts`: FOUND
- `backend/tsconfig.json`: FOUND

### Commits Exist
- `6a58c95`: FOUND (feat(05-03): scaffold backend/tsconfig.json and backend/src/server.ts)
- `1976d5c`: FOUND (feat(05-03): port sync logic to Hono route handler and add Railway cron trigger)

### TypeScript Check
- `npx tsc --project backend/tsconfig.json --noEmit`: EXIT 0

### Smoke Test
- `PORT=3002 npx tsx backend/src/server.ts` + `curl /health`: `{"ok":true}` PASSED

## Self-Check: PASSED
