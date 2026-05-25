---
phase: 05-railway-migration
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 10
files_reviewed_list:
  - src/db/index.ts
  - src/app/api/revalidate/route.ts
  - backend/src/server.ts
  - backend/src/routes/sync.ts
  - backend/trigger/cron.ts
  - backend/tsconfig.json
  - Dockerfile
  - railway.toml
  - vercel.json
  - package.json
findings:
  critical: 4
  warning: 4
  info: 2
  total: 10
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 10
**Status:** issues_found

## Summary

This phase introduces a Railway-hosted backend service (Hono server + cron trigger) that runs the heavy sync job outside Vercel. The overall architecture is sound and the CRON_SECRET guard appears in both the Vercel revalidate route and the Hono sync handler. However, four critical issues were found: the Dockerfile runs the full application stack as root with no privilege drop, `npm install` in Docker pulls the entire devDependency tree into the production image, the sync handler leaks the current `CRON_SECRET` value in a 500 error response body when secrets are misconfigured, and the `revalidateTag` call on the Vercel side uses a two-argument signature that does not match the Next.js API. Four warnings cover weaker but still impactful gaps: missing `BACKEND_INTERNAL_URL` / `CRON_SECRET` guard in the cron trigger, no `ssl` config in the pool for the Railway environment, the `syncHandler` variable `c` shadowing Hono's outer `Context` parameter, and a missing `healthcheckTimeout` in `railway.toml`. Two info items note the use of `npx tsx` in production and the `@hono/node-server` version mismatch.

---

## Critical Issues

### CR-01: Dockerfile runs as root with no privilege drop

**File:** `Dockerfile:1`
**Issue:** The Dockerfile uses `node:22-slim` but never adds a non-root user and never issues `USER`. The process running `npx tsx backend/src/server.ts` therefore runs as UID 0 inside the container. If any code-execution path is exploited (e.g., through a compromised npm package or an unfixed vulnerability in `tsx`/`esbuild`) the attacker has full root inside the container, which trivially escalates to host escape in poorly-configured container runtimes.
**Fix:**
```dockerfile
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# Drop to non-root before running anything
RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser
USER appuser

EXPOSE 3000
CMD ["node", "--import", "tsx/esm", "backend/src/server.ts"]
```

---

### CR-02: Production Docker image includes all devDependencies

**File:** `Dockerfile:6`
**Issue:** `RUN npm install` installs all dependencies including `devDependencies` (TypeScript compiler, `drizzle-kit`, `eslint`, etc.). This bloats the image, increases attack surface, and ships build tools into production. `npm install` also does not enforce the lockfile — if `package-lock.json` diverges, the build silently installs different versions.
**Fix:**
```dockerfile
# Enforces lockfile and omits devDependencies
RUN npm ci --omit=dev
```

---

### CR-03: Sync error response leaks secret names that are missing

**File:** `backend/src/routes/sync.ts:18-21`
**Issue:** When required environment variables are absent the handler returns a `500` JSON body listing them by name:
```json
{ "ok": false, "missing": ["CRON_SECRET", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN"] }
```
This is reachable only after the `CRON_SECRET` guard passes, so unauthenticated callers cannot see it. However, any caller that already holds a valid `CRON_SECRET` learns the exact names of secrets the operator has not yet provisioned — useful reconnaissance. More critically, if the `CRON_SECRET` environment variable itself is absent, the guard on line 14 short-circuits to `401` correctly, but if it IS present and the caller has it, the `missing` array will expose which other secrets are absent. The list should be replaced with a generic error or logged server-side only.
**Fix:**
```typescript
const missing = ["DATABASE_URL", "GITHUB_TOKEN", "BLOB_READ_WRITE_TOKEN", "VERCEL_REVALIDATE_URL"].filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error('[sync] missing env vars:', missing);
  return c.json({ ok: false, error: 'Server misconfiguration' }, 500);
}
```
Note: `CRON_SECRET` is already validated by the guard above; it does not need to be in this list.

---

### CR-04: `revalidateTag` called with two arguments — second argument is ignored / wrong API

**File:** `src/app/api/revalidate/route.ts:11`
**Issue:** `revalidateTag("casks", "max")` passes two arguments to `revalidateTag`. The Next.js `revalidateTag` function signature is `revalidateTag(tag: string): void` — it accepts exactly one argument. The second argument `"max"` is silently dropped by TypeScript's structural typing but has no effect. If the intent was to revalidate multiple tags, two calls are needed; if `"max"` was meant to be a cache revalidation option it does not exist in this API. The current code likely only revalidates the `"casks"` tag, missing whatever `"max"` was intended to accomplish. This is a correctness bug.
**Fix:**
```typescript
// If only "casks" is intended:
revalidateTag("casks");

// If both "casks" and "max" are separate tags:
revalidateTag("casks");
revalidateTag("max");
```

---

## Warnings

### WR-01: Cron trigger has no guard for missing `BACKEND_INTERNAL_URL` or `CRON_SECRET`

**File:** `backend/trigger/cron.ts:2-3`
**Issue:** Both `BACKEND_INTERNAL_URL` and `CRON_SECRET` are accessed with the non-null assertion operator (`!`) but neither is validated before use. If either is undefined, `fetch(\`${undefined}/sync\`)` resolves to `fetch("undefined/sync")` and throws a `TypeError: Failed to parse URL`, which is caught by the `.catch` handler and exits with code 1 — but the error message is opaque. For `CRON_SECRET`, an undefined value means the `Authorization` header sent is `"Bearer undefined"`, which the sync handler will correctly reject with 401, but the operator receives no clear signal about why.
**Fix:**
```typescript
const BACKEND_INTERNAL_URL = process.env.BACKEND_INTERNAL_URL;
const CRON_SECRET = process.env.CRON_SECRET;

if (!BACKEND_INTERNAL_URL || !CRON_SECRET) {
  console.error('[cron] missing required env vars: BACKEND_INTERNAL_URL, CRON_SECRET');
  process.exit(1);
}
```

---

### WR-02: Database pool uses `rejectUnauthorized: false` — disables TLS certificate verification in production

**File:** `src/db/index.ts:7`
**Issue:** `ssl: { rejectUnauthorized: false }` is used for all production connections. This disables server certificate validation, making the connection vulnerable to a man-in-the-middle attack: an attacker on the network path between Railway and the database could intercept credentials and all query data. Neon and most managed Postgres providers supply valid CA-signed certificates; `rejectUnauthorized` should be `true` (the default) in production.
**Fix:**
```typescript
ssl: process.env.NODE_ENV === 'production' ? true : false,
// or, if the CA cert needs to be pinned:
ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
```

---

### WR-03: Variable `c` in icon loop shadows the outer Hono `Context` parameter

**File:** `backend/src/routes/sync.ts:74`
**Issue:** The `syncHandler` function parameter is named `c: Context` (line 11). Inside the icon processing loop on line 74, `group.map(async (c) => { ... })` re-uses the name `c` for the loop element — a cask `{ token, homepage }` object. TypeScript resolves the inner `c` correctly (it shadows the outer one), but if any developer adds code inside the closure that intends to call `c.json(...)` (the Hono response method) they will instead operate on the cask object, producing a runtime error. The shadow is a maintenance trap.
**Fix:** Rename the loop variable:
```typescript
group.map(async (cask) => {
  try {
    const { url, isFallback } = await fetchAndStoreIcon(cask.token, cask.homepage ?? "");
    await db.update(casks).set({ icon_url: url, icon_is_fallback: isFallback }).where(eq(casks.token, cask.token));
```

---

### WR-04: `railway.toml` has no `healthcheckTimeout` — Railway may recycle healthy pods under load

**File:** `railway.toml:1-3`
**Issue:** The `railway.toml` only sets `healthcheckPath = "/health"`. Railway's default healthcheck timeout is 300 seconds. During a sync run (which is a long-running POST that may take 5-10 minutes for ~17K casks + icon pipeline + GitHub enrichment), the Railway healthcheck polls `/health` on the web service. If the sync occupies all available event-loop time (unlikely with async I/O but possible during heavy batching), Railway may time out and restart the pod mid-sync, leaving the database in a partially-upserted state. Setting an explicit timeout documents intent and allows tuning. Additionally, a `startCommand` is absent — Railway will use the Dockerfile `CMD` by default which is correct, but documenting it in `railway.toml` makes the deployment reproducible.

**Fix:**
```toml
[deploy]
healthcheckPath = "/health"
healthcheckTimeout = 300
startCommand = "npx tsx backend/src/server.ts"
```

---

## Info

### IN-01: `npx tsx` used as production entrypoint — should use compiled output

**File:** `Dockerfile:11`
**Issue:** `CMD ["npx", "tsx", "backend/src/server.ts"]` runs TypeScript source directly via `tsx` (an esbuild-based JIT transpiler) in the production container. This works but adds unnecessary startup latency from on-the-fly transpilation, ships TypeScript source into the image, and relies on `tsx` (a devDependency) being present. The `backend/tsconfig.json` already has `"outDir": "./dist"` configured; compiling to JS and running `node dist/backend/src/server.js` is more appropriate for production.

**Fix:**
```dockerfile
RUN npm ci --omit=dev && npx tsc -p backend/tsconfig.json
CMD ["node", "backend/dist/src/server.js"]
```
Alternatively, keep `tsx` but move it to `dependencies` and document this as an intentional tradeoff.

---

### IN-02: `@hono/node-server` version `^2.0.4` — package.json may pull a version incompatible with `hono@^4`

**File:** `package.json:17`
**Issue:** `@hono/node-server` version `^2.0.4` is listed while `hono` is at `^4.12.23`. The Hono project releases `@hono/node-server` with version numbers that track `hono` major versions (v1.x for Hono v4). Version 2.x of `@hono/node-server` targets Hono v5. Using v2 of the adapter with Hono v4 may introduce `fetch`/`serve` API incompatibilities that are silent at startup but fail at request time. The published compatible adapter for `hono@^4` is `@hono/node-server@^1.x`.

**Fix:** Pin the adapter to the compatible major version:
```json
"@hono/node-server": "^1.14.0"
```
Verify the installed version resolves correctly with `npm ls @hono/node-server`.

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
