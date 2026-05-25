# Phase 5: Railway Migration - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Move the backend infrastructure — sync cron job, API route handler, and Postgres database — from Vercel/Neon to Railway hobby tier ($5/mo), while keeping the Next.js frontend deployed on Vercel. Both services coexist in the same git repository. The Neon database has no production data, so migration is a fresh provision rather than a dump/restore.

</domain>

<decisions>
## Implementation Decisions

### Monorepo Layout
- **D-01:** Keep the current Next.js app at the repo root (Vercel builds from root — no change to Vercel project settings). Add a `backend/` subdirectory for the Railway service.
- **D-02:** The `backend/` directory contains a minimal Hono HTTP server (not a Next.js app, not a plain script).
- **D-03:** DB schema and queries are shared via relative imports from `src/db/` into `backend/`. Single source of truth for schema. The backend's build must resolve paths across the subdirectory boundary (e.g., tsconfig `paths` or relative `../../src/db`).

### Railway Backend Shape
- **D-04:** HTTP framework: Hono. TypeScript-native, minimal footprint, familiar handler syntax.
- **D-05:** Cron trigger: Railway built-in Cron service type. Railway calls `POST /sync` with `Authorization: Bearer <CRON_SECRET>` on the configured schedule. No `node-cron` package needed inside the process.
- **D-06:** Auth guard: keep the existing `CRON_SECRET` bearer token pattern from the Phase 1 sync route. Same check, same env var name.

### Vercel Blob
- **D-07:** Vercel Blob stays as the icon store. The Railway sync job writes to Blob using `BLOB_READ_WRITE_TOKEN` as an env var on the Railway service. No storage migration, no URL changes in the database, no `remotePatterns` changes in Next.js.

### Database Driver + Migration
- **D-08:** Replace `@neondatabase/serverless` + `drizzle-orm/neon-http` with the standard `pg` driver + `drizzle-orm/node-postgres` everywhere — both the Next.js frontend (`src/db/index.ts`) and the Railway backend.
- **D-09:** No dump/restore needed — Neon has no production data. Provision Railway Postgres → run `drizzle-kit push` to create the schema → trigger a full sync to populate from scratch.
- **D-10:** Single `DATABASE_URL` environment variable, updated in both the Vercel project env and the Railway service env to point at Railway Postgres after cutover.

### Claude's Discretion
- Railway service sleep/wake-on-request config (Railway handles this by default for hobby tier services — planner should enable it if it's not the default)
- `backend/` TypeScript config and build tooling (tsconfig, tsx vs tsc, package.json scripts)
- Railway deployment config (railway.toml or Nixpacks auto-detection)
- Cron schedule for the sync job (was every 6h on Vercel; planner should match or confirm with Railway cron syntax)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Current DB Setup
- `src/db/index.ts` — current Neon HTTP driver setup; must be replaced with pg driver
- `src/db/schema.ts` — Drizzle schema; shared between frontend and backend
- `drizzle.config.ts` — current Drizzle Kit config; must be updated to use pg dialect/driver

### Current Sync Job
- `src/app/api/cron/sync/route.ts` — the sync logic being migrated to Railway; backend/ should replicate this logic as a Hono route handler

### Project Config
- `package.json` — current deps including `@neondatabase/serverless`; `pg` and `@types/pg` need to be added; `@neondatabase/serverless` removed
- `next.config.ts` — check for any Neon-specific config that should be removed after driver switch

### Roadmap
- `.planning/ROADMAP.md` §Phase 5 — success criteria and goals for this phase

No external ADRs — all decisions captured in this context file.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/db/schema.ts`: Full Drizzle schema — backend/ imports this directly via relative path
- `src/lib/fetch-allowlist.ts`: SSRF allowlist wrapper — backend sync job should import and use this same module
- `src/lib/homebrew.ts`: Homebrew API client — reuse directly in backend sync handler
- `src/lib/github.ts`: Octokit GitHub enrichment — reuse in backend sync handler

### Established Patterns
- CRON_SECRET bearer auth: `Authorization: Bearer` header check at route entry — keep this exact pattern in Hono route
- `drizzle-orm` query style: all queries use the `db` export from `src/db/index.ts` — after driver swap, queries don't change, only the driver init changes

### Integration Points
- `src/db/index.ts`: Single place to change the driver from neon-http to node-postgres; both Next.js and backend/ will import from here
- Vercel env vars: `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, `CRON_SECRET`, `GITHUB_TOKEN` — all need to be mirrored in Railway service env vars (minus any Vercel-specific ones)

</code_context>

<specifics>
## Specific Ideas

- Railway Cron service calls `POST /sync` — same path as the current Next.js API route for easy mental mapping
- Keep `CRON_SECRET` env var name unchanged across both Vercel and Railway to minimize config drift

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 5-railway-migration*
*Context gathered: 2026-05-24*
