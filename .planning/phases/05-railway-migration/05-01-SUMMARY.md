---
phase: 05-railway-migration
plan: "01"
subsystem: database
tags: [railway, postgres, node-postgres, drizzle, driver-swap]
dependency_graph:
  requires: []
  provides: [db-export-node-postgres]
  affects: [src/db/index.ts, package.json]
tech_stack:
  added: [pg@8.21.0, "@types/pg@8.20.0"]
  removed: ["@neondatabase/serverless"]
  patterns: [pg.Pool with max:2 and ssl conditional, drizzle-orm/node-postgres]
key_files:
  created: []
  modified: [src/db/index.ts, package.json]
decisions:
  - "pg.Pool max:2 prevents connection exhaustion across Vercel serverless instances"
  - "SSL uses rejectUnauthorized:false in production (Railway enforces SSL but uses self-signed cert)"
  - "Added pg and @types/pg explicitly to package.json — they were transitive but are now direct dependencies"
metrics:
  completed_date: "2026-05-25"
  duration: "~5 minutes"
  tasks_completed: 1
  tasks_total: 3
  status: checkpoint_reached
---

# Phase 5 Plan 01: Railway Postgres Driver Swap Summary

**One-liner:** Replaced Neon HTTP driver with pg.Pool (drizzle-orm/node-postgres) with max:2 SSL-conditional config, removed @neondatabase/serverless from package.json.

## Status: CHECKPOINT REACHED — Awaiting Human Action

Task 1 is complete and committed. Tasks 2 and 3 require human provisioning of Railway Postgres before proceeding.

## Tasks Completed

### Task 1: Swap neon-http driver for node-postgres (DONE — commit 4937293)

**src/db/index.ts** was rewritten from:
```ts
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';
export const db = drizzle(process.env.DATABASE_URL!, { schema });
```

To:
```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL!,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 2,
});

export const db = drizzle({ client: pool, schema });
```

**package.json** changes:
- Removed: `@neondatabase/serverless@^1.1.0`
- Added to dependencies: `pg@^8.21.0`
- Added to devDependencies: `@types/pg@^8.20.0`

## Tasks Pending

### Task 2: [HUMAN] Provision Railway Postgres and update DATABASE_URL
Requires user to provision Railway Postgres service and update `.env.local` with the new connection string.

### Task 3: Run drizzle-kit push to create schema on Railway Postgres
Blocked by Task 2. After DATABASE_URL is set, runs `npx drizzle-kit push` and `npm install`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added pg and @types/pg explicitly to package.json**
- **Found during:** Task 1
- **Issue:** The plan states "pg is already present (line 28)" but package.json only had `@neondatabase/serverless` — `pg` was only available as a transitive dependency. Direct imports from `pg` in `src/db/index.ts` require it to be an explicit dependency.
- **Fix:** Added `pg@^8.21.0` to dependencies and `@types/pg@^8.20.0` to devDependencies. Versions matched what was already installed transitively.
- **Files modified:** package.json
- **Commit:** 4937293

## Threat Surface Scan

No new threat surface introduced beyond what is documented in the plan's `<threat_model>`. The SSL configuration (T-05-02) and connection pool cap (T-05-03) are correctly implemented in `src/db/index.ts`.

## Known Stubs

None.

## Self-Check: PASSED

- [x] src/db/index.ts exists and contains `drizzle-orm/node-postgres`, `new Pool(`, `max: 2`, `rejectUnauthorized`
- [x] package.json has 0 references to `neondatabase/serverless`
- [x] Commit 4937293 exists
