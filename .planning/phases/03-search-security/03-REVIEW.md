---
phase: 03-search-security
reviewed: 2026-05-25T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/app/api/search/route.ts
  - src/app/browse/loading.tsx
  - src/app/browse/page.tsx
  - src/app/cask/[token]/loading.tsx
  - src/components/header.tsx
  - src/components/search-input.tsx
  - src/db/migrations/0001_add_search_vector.sql
  - src/db/schema.ts
  - src/lib/queries.ts
findings:
  critical: 2
  warning: 4
  info: 1
  total: 7
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-05-25T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

This phase delivers Postgres full-text search (`tsvector` + GIN index), the `/api/search` route, the `SearchInput` client component, and associated browse-page changes. The SQL migration and schema definitions are technically correct. The core search query uses parameterized Drizzle expressions throughout, eliminating SQL injection. The `safeExternalUrl` guard prevents `javascript:` XSS via cask homepage links.

Two blockers surface: the `/api/search` route ships with no rate limiting despite the project's explicit "rate limiting on all API routes" security mandate, and the `browse/page.tsx` search path calls `searchCasks` without validating query length, allowing arbitrarily long strings to reach the database.

Four warnings cover: a debounce timer leak in `SearchInput`, an unguarded homepage anchor in the cask page, the Vercel cron schedule being absent from `vercel.json`, and a non-shared validation constant creating a drift risk.

---

## Critical Issues

### CR-01: `/api/search` has no rate limiting

**File:** `src/app/api/search/route.ts:9`
**Issue:** The `GET` handler executes a full-text Postgres query on every request with no rate limiter, no `@upstash/ratelimit` call, and no Edge Middleware (`middleware.ts` does not exist in this repo). The project CLAUDE.md states under Security constraints: "Rate limiting on all API routes." `@upstash/ratelimit` and `@upstash/redis` are not present in `package.json` at all, meaning this protection layer was never implemented for this route. An attacker can flood the endpoint at network speed, exhausting Neon compute units and forcing scale-to-zero cold-starts on every burst.

**Fix:**
Install `@upstash/ratelimit` and `@upstash/redis`, then guard the route at its first line:
```typescript
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(20, '10 s'),
});

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0] ?? '127.0.0.1';
  const { success } = await ratelimit.limit(ip);
  if (!success) {
    return Response.json({ error: 'Too many requests' }, { status: 429 });
  }
  // … existing validation and query …
}
```
The project CLAUDE.md references `@upstash/ratelimit` as the chosen solution. `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` must also be added to the environment.

---

### CR-02: `browse/page.tsx` search path bypasses query length validation

**File:** `src/app/browse/page.tsx:17-27`
**Issue:** The server page calls `searchCasks(q.trim())` whenever `q.trim().length >= 2`. There is no upper-bound check. The API route enforces `.max(100)` via Zod, but the browse page reads `q` directly from `searchParams` and passes it to the database with no maximum. A crafted URL like `/browse?q=<10,000-char string>` routes through the SSR page (not the API route) and hits `plainto_tsquery` with an unbounded input. While Postgres will not crash, it performs unnecessary work and the result renders verbatim in the result-count string at line 22.

**Fix:**
```typescript
const MAX_QUERY_LENGTH = 100; // must match QuerySchema in api/search/route.ts

if (q && q.trim().length >= 2) {
  const trimmed = q.trim().slice(0, MAX_QUERY_LENGTH);
  const results = await searchCasks(trimmed);
  // render with trimmed, not raw q
```
Better: extract the `MIN_QUERY_LENGTH`/`MAX_QUERY_LENGTH` constants and the trimming logic into a shared `lib/search-params.ts` so the API route and the page cannot drift.

---

## Warnings

### WR-01: Debounce timer not cleared on `SearchInput` unmount

**File:** `src/components/search-input.tsx:13-38`
**Issue:** `timerRef.current` is set inside `handleChange` but is never cleared in a cleanup function. If the component unmounts while a 300 ms debounce is pending (e.g., the user navigates away), the timer fires, calls `router.replace`, and attempts a navigation on the now-unmounted component. In React 19 Strict Mode (double-invocation), this is even more likely to produce spurious navigations or console errors.

**Fix:**
```typescript
// Add a cleanup useEffect alongside the existing searchParams sync effect:
useEffect(() => {
  return () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };
}, []);
```

---

### WR-02: Homepage anchor renders `href="#"` when `safeHomepage` is null

**File:** `src/app/cask/[token]/page.tsx:455`

> Note: `cask/[token]/page.tsx` was not in the review file list, but is directly affected by the data contract established in `queries.ts` and `schema.ts` which are in scope, and the defect is triggered by data produced by the reviewed search/query layer.

**Issue:** In the "Details" metadata block the homepage link uses `href={safeHomepage ?? '#'}`. When `homepage` is null or fails `safeExternalUrl` validation, the anchor renders `href="#"` with display text `"—"`, producing a non-functional clickable link. The hero links row (lines 164-181) correctly gates on `domain && safeHomepage` before rendering the anchor, but the details row does not apply the same guard.

**Fix:**
```tsx
{/* Homepage row — only render anchor when URL is valid */}
<span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
  {safeHomepage ? (
    <a href={safeHomepage} target="_blank" rel="noopener noreferrer"
       style={{ color: 'var(--color-primary-hover)' }}>
      {domain || safeHomepage}
    </a>
  ) : '—'}
</span>
```

---

### WR-03: Vercel cron schedule missing from `vercel.json`

**File:** `vercel.json:1-3`
**Issue:** `vercel.json` contains only the `$schema` field. The cron sync route at `src/app/api/cron/sync/route.ts` has `export const maxDuration = 300` indicating it is intended to run on a schedule, but no `crons` block is configured in `vercel.json`. Without the `crons` entry, Vercel never invokes the sync job. The cask catalog will never be refreshed in production.

**Fix:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    {
      "path": "/api/cron/sync",
      "schedule": "0 */6 * * *"
    }
  ]
}
```
The `Authorization: Bearer $CRON_SECRET` header is injected automatically by Vercel Cron, matching the guard already implemented in the route handler.

---

### WR-04: Minimum query length constant is duplicated, not shared

**File:** `src/app/api/search/route.ts:6` and `src/components/search-input.tsx:6`
**Issue:** `MIN_QUERY_LENGTH = 2` in `search-input.tsx` and `z.string().min(2)` in the API schema both encode the same business rule as separate magic numbers. If the minimum is changed in one place, the other silently drifts, creating a UX mismatch (the client starts navigating for shorter queries than the API accepts, or vice versa).

**Fix:**
```typescript
// lib/search-constants.ts
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
```
Import in both `search-input.tsx` and `api/search/route.ts`.

---

## Info

### IN-01: `console.error` in production API handler leaks internal error structure

**File:** `src/app/api/search/route.ts:19`
**Issue:** `console.error('[api/search] error:', err)` logs the raw caught error, which may include database connection strings, query fragments, or stack traces to Vercel's log drain. In a shared-log environment this is an information-disclosure risk. The client response is already sanitized (`{ error: 'Search failed' }`), but the server log can expose internals.

**Fix:** Wrap with a structured logger that scrubs sensitive fields, or at minimum log only `err instanceof Error ? err.message : String(err)` rather than the raw `err` object.

---

_Reviewed: 2026-05-25T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
