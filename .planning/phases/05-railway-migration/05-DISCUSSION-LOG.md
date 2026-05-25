# Phase 5: Railway Migration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 5-railway-migration
**Areas discussed:** Monorepo layout, Railway backend shape, Vercel Blob fate, DB migration cutover

---

## Monorepo Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Root = Next.js, backend/ subdirectory | Keep Next.js at repo root; add backend/ for Railway service. Minimal disruption to Vercel. | ✓ |
| apps/ monorepo split | Move Next.js to apps/web/, create apps/backend/. Cleaner but requires updating all Vercel build settings and import paths. | |
| Separate git repo for backend | Railway backend in its own repo. Violates the single-repo success criterion. | |

**User's choice:** Root = Next.js, backend/ subdirectory

---

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone Node.js script | Plain TS script, runs and exits. Simplest backend. | |
| Minimal Express/Hono HTTP server | Small HTTP server exposing sync endpoint. Testable with curl. | ✓ |
| Keep as Next.js App Router route | Deploy same Next.js app on Railway. Two full Next.js deployments. | |

**User's choice:** Minimal Express/Hono HTTP server

---

| Option | Description | Selected |
|--------|-------------|----------|
| Shared src/db/ via relative import | backend/ imports schema/queries from src/db/. Single source of truth. | ✓ |
| Copy schema into backend/src/db/ | Duplicate schema inside backend/. Can drift. | |
| You decide | Leave to planner. | |

**User's choice:** Shared src/db/ via relative import

---

## Railway Backend Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Hono | Tiny, TypeScript-native, familiar handler syntax. | ✓ |
| Express | Battle-tested, heavier than Hono. | |
| Plain http module | No framework. Absolute minimum footprint. | |

**User's choice:** Hono

---

| Option | Description | Selected |
|--------|-------------|----------|
| Railway built-in Cron service | First-class Railway Cron type calls HTTP endpoint on schedule. Included in hobby plan. | ✓ |
| node-cron inside server process | node-cron package inside running server. Server must always be running — counteracts sleep goal. | |
| GitHub Actions scheduled workflow | GitHub Actions calls Railway endpoint. External dependency. | |

**User's choice:** Railway built-in Cron service

---

| Option | Description | Selected |
|--------|-------------|----------|
| Keep CRON_SECRET bearer token | Same pattern as existing route. Railway Cron sends Authorization: Bearer. | ✓ |
| Railway internal networking | Private networking so no HTTP auth needed. Requires same Railway project. | |

**User's choice:** Keep CRON_SECRET bearer token

---

## Vercel Blob Fate

| Option | Description | Selected |
|--------|-------------|----------|
| Keep Vercel Blob, Railway writes via BLOB_READ_WRITE_TOKEN | Token works from any environment. No storage migration, no URL changes in DB. | ✓ |
| Move to Railway-managed storage | S3-compatible bucket or Railway volume. Requires migrating all blob URLs in DB. | |
| Drop icon caching — serve hot-linked | Remove blob upload step. Simpler but loses Phase 1 reliability improvement. | |

**User's choice:** Keep Vercel Blob, Railway writes via BLOB_READ_WRITE_TOKEN

---

## DB Migration Cutover

| Option | Description | Selected |
|--------|-------------|----------|
| pg_dump from Neon + psql restore | Standard dump/restore. Battle-tested. | ✓ (moot — no data in Neon) |
| Drizzle push + re-run sync to repopulate | Fresh Railway Postgres, push schema, trigger full sync. | Effectively this is what happens given no Neon data |
| You decide | Leave migration to planner. | |

**User's choice:** pg_dump/restore selected initially; user clarified Neon has no data, so migration simplifies to: provision Railway Postgres → drizzle-kit push → trigger sync.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Switch to drizzle-orm/node-postgres (pg driver) | Standard pg driver, works with any Postgres including Railway. | ✓ |
| Keep @neondatabase/serverless pointing at Railway | Neon HTTP driver is Neon-proprietary — not viable. | |
| Use drizzle-orm/postgres-js | postgres.js, lighter than pg. Works fine on Railway. | |

**User's choice:** drizzle-orm/node-postgres (pg driver)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Switch frontend too — same pg driver everywhere | Consistent driver in src/db/index.ts for both Next.js and backend/. | ✓ |
| Keep @neondatabase/serverless on frontend, pg on backend | Neon driver can't point at Railway — not viable. | |

**User's choice:** Switch frontend too — same pg driver everywhere

---

## Claude's Discretion

- Railway service sleep/wake-on-request config
- backend/ TypeScript config, build tooling, package.json scripts
- Railway deployment config (railway.toml or Nixpacks auto-detection)
- Cron schedule (match existing 6h schedule or confirm with Railway cron syntax)

## Deferred Ideas

None — discussion stayed within phase scope.
