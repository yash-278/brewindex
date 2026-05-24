---
plan: 01-01
phase: 01-data-pipeline
status: complete
completed: 2026-05-24
commits:
  - e3a7d2d
  - 330b3f7
---

## What Was Built

Walking skeleton for the BrewIndex data pipeline. Scaffold + schema + SSRF wrapper + one-cask cron route — full HTTP-to-DB path proven end-to-end.

## Key Files Created

- `src/db/schema.ts` — 18-column `casks` pgTable with `CaskInsertRow` / `CaskSelectRow` types
- `src/db/index.ts` — `drizzle-orm/neon-http` connection (HTTP driver, no TCP exhaustion)
- `src/lib/fetch-allowlist.ts` — `safeFetch()` SSRF wrapper (4-host allowlist + redirect chain validation)
- `drizzle.config.ts` — drizzle-kit push config with dotenv `.env.local` loading
- `vercel.json` — daily cron at `0 6 * * *`
- `src/app/api/cron/sync/route.ts` — skeleton cron route: CRON_SECRET guard first, env validation, one-cask fetch + upsert

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | 0 errors |
| `npx drizzle-kit push` | ✓ casks table created in Neon |
| `curl /api/cron/sync` (no auth) | 401 |
| `curl /api/cron/sync` (valid CRON_SECRET) | `{"ok":true,"synced":1}` |
| Row in Neon | `[{"token":"firefox","name":"Mozilla Firefox"}]` |
| CRON_SECRET guard position | First executable statement in handler |
| `revalidateTag` args | `('casks', 'max')` — two args ✓ |

## Deviations

- `drizzle.config.ts` required `dotenv` import to load `.env.local` — drizzle-kit v0.31 does not auto-load `.env.local` without it. Added `config({ path: '.env.local' })` call at top of config file.
- DB verification via raw `@neondatabase/serverless` neon client (not tsx drizzle import) — tsx inline import order prevents dotenv from running before the module initializes.

## Self-Check: PASSED

All must_haves satisfied. Plans 02–04 can extend this skeleton.
