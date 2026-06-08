---
phase: 04-discovery-layer
reviewed: 2026-05-27T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - scripts/categorize-casks.ts
  - src/app/browse/page.tsx
  - src/app/cask/[token]/page.tsx
  - src/components/cask-card.tsx
  - src/components/cask-grid.tsx
  - src/components/category-filter.tsx
  - src/components/github-stats-card.tsx
  - src/components/sort-dropdown.tsx
  - src/components/star-badge.tsx
  - src/db/migrations/0002_add_category.sql
  - src/db/schema.ts
  - src/lib/queries.ts
findings:
  critical: 3
  warning: 5
  info: 3
  total: 11
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-05-27T00:00:00Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

This phase adds category filtering, sort controls, and a Bedrock-powered ML categorization script to the BrewIndex discovery layer. The query layer (`queries.ts`) is mostly solid but contains a critical cache-key collision bug and a broken cache-invalidation call. The categorization script has a misuse of a Next.js server-only API (`revalidateTag`) that will throw at runtime. The browse page exposes an open-redirect via an insufficiently validated `page` redirect. Several warnings exist around error-handling gaps, type narrowing, and category null-leakage into the UI.

## Critical Issues

### CR-01: `revalidateTag` called from a Node.js script — will throw at runtime

**File:** `scripts/categorize-casks.ts:289`
**Issue:** `revalidateTag` is a Next.js server-side API that only works inside the Next.js request lifecycle (Route Handlers, Server Components, Server Actions). Calling it from a standalone `tsx` script via `drizzle-orm/node-postgres` has no Next.js runtime context. The call will either silently no-op or throw `Error: Invariant: static generation store missing` depending on the Next.js version. The ISR cache is **not** actually invalidated — the browse page will continue serving stale category data after the categorization run completes.

Additionally, `revalidateTag` is called with two arguments (`"casks"` and `"max"`) on line 289. The function signature is `revalidateTag(tag: string): void` — it does not accept a second argument. This is a type error that TypeScript should catch but may not if the import is untyped.

**Fix:** Remove the `revalidateTag` import and call entirely from the script. Cache invalidation from an offline script must be done via the Next.js On-Demand Revalidation API (a POST to `/api/revalidate?tag=casks&secret=<token>`), or by running `revalidateTag` inside a Route Handler that the script triggers via `fetch`. At minimum, add a comment instructing operators to manually trigger revalidation after the script runs.

```typescript
// Remove from imports:
// import { revalidateTag } from "next/cache";

// Replace lines 287-290 with:
console.log('\nNote: ISR cache will refresh on next scheduled revalidation.');
console.log('To force immediate refresh, call the revalidation endpoint:');
console.log('  curl -X POST "https://your-domain.com/api/revalidate?tag=casks&secret=<token>"');
```

---

### CR-02: `unstable_cache` key collision — `getCasksPageFiltered` and `getCasksCountFiltered` ignore dynamic arguments

**File:** `src/lib/queries.ts:92-136`
**Issue:** `unstable_cache` uses the static string array passed as the second argument (`['casks-filtered']` and `['casks-count-filtered']`) as the **base** cache key, then appends function arguments to form the full key. However, the wrapped functions accept an `opts` object (for `getCasksPageFiltered`) and a `category` string (for `getCasksCountFiltered`). Because `unstable_cache` serializes arguments using `JSON.stringify`, the key construction should work in theory — but there is a subtle correctness issue: the `opts` object key for `getCasksPageFiltered` includes `sort`, `category`, and `page`, while the count function only receives `category`. This means a browse page at `?category=Games&sort=alphabetical&page=2` and one at `?category=Games&sort=popular&page=1` will produce distinct cache entries for the *filtered list* but the **same** cache entry for the *count* — which is correct, since count does not depend on sort or page.

The actual bug: `getCasksPageFiltered` wraps an `opts` *object*. `unstable_cache` caches by the exact arguments passed to the wrapper. Each unique `opts` object literal produces a separate cache entry, so **`{category: "Games", sort: "popular", page: 1}` and `{category: "Games", sort: "popular", page: 1}` (two separate calls) will correctly hit the same entry**. However, `unstable_cache` documentation warns that it only serializes JSON-serializable arguments. An `undefined` `category` field in `opts` is serialized as the key `{"sort":"popular","page":1}` (key omitted), which differs from `{"category":undefined,"sort":"popular","page":1}`. Since the browse page always passes the `category` from `searchParams` which can be `undefined`, while the function signature declares `category?: string`, this will produce cache misses when `category` is absent vs. when it is explicitly `undefined`. This is a correctness issue — two logically identical requests (no category filter) may bypass the cache depending on how the caller constructs the argument.

**Fix:** Normalize `category` to `null` (or omit it entirely) in the cache key by always passing a canonical form:

```typescript
// In getCasksPageFiltered, normalize category before caching:
async (opts: { category: string | null; sort: 'popular' | 'alphabetical' | 'updated'; page: number }) => {
  const category = opts.category ?? null;
  // ...
}

// In browse/page.tsx, always pass null instead of undefined:
getCasksPageFiltered({ category: category ?? null, sort: sortKey, page }),
getCasksCountFiltered(category ?? null),
```

---

### CR-03: Open redirect via unvalidated `page` parameter

**File:** `src/app/browse/page.tsx:48-50`
**Issue:** When `page > totalPages`, the server redirects to `/browse?page=` + `totalPages`. The `page` value fed into `totalPages` originates from `parseInt(pageParam ?? '1', 10)` which is safe. However, the redirect preserves **none** of the other query parameters (`category`, `sort`). A user browsing `?category=Games&sort=alphabetical&page=999` is silently redirected to `/browse?page=N`, dropping their filter and sort state. This is a functional bug: after the redirect the user sees a different result set than they were navigating.

Beyond UX, `pageParam` is sourced from user-supplied `searchParams` and passed through `parseInt`, so the numeric value itself is safe from injection — but the category and sort values are discarded, making the redirect logically incorrect.

**Fix:** Preserve query params in the redirect:

```typescript
if (page > totalPages && totalPages > 0) {
  const redirectParams = new URLSearchParams();
  redirectParams.set('page', String(totalPages));
  if (category) redirectParams.set('category', category);
  if (sort && sort !== 'popular') redirectParams.set('sort', sort);
  redirect('/browse?' + redirectParams.toString());
}
```

---

## Warnings

### WR-01: `categorizeCask` has no retry logic — single Bedrock failure silently marks cask as skipped

**File:** `scripts/categorize-casks.ts:245-268`
**Issue:** `Promise.allSettled` captures Bedrock failures gracefully, but failed casks are simply counted as `failureCount` and never retried. Since `category` remains `NULL` in the DB, these casks are invisible to category filters. For a ~7,600-cask run with network jitter, a significant number of casks may be permanently uncategorized until the script is re-run. There is no mechanism to distinguish "permanently uncategorizable" from "transient Bedrock timeout."

**Fix:** Add at minimum one retry (with exponential backoff) inside `categorizeCask`, or collect failed tokens and re-run them in a second pass at the end of `main()`.

---

### WR-02: `flushUpdates` runs sequential individual `UPDATE` statements without a transaction

**File:** `scripts/categorize-casks.ts:169-176`
**Issue:** Each `db.update(...)` in `flushUpdates` is a separate round-trip. For a batch of 20 casks this is 20 sequential DB round-trips. If the process is killed mid-flush, some casks in the batch get categories and others do not — there is no atomicity. For a non-transactional batch script this is arguably acceptable, but for data consistency of a categorization run the partial update leaves the DB in an indeterminate state with no way to detect which casks were partially processed within a batch.

**Fix:** Wrap the loop in a transaction, or use a `CASE`-based bulk `UPDATE`:

```typescript
await db.transaction(async (tx) => {
  for (const { id, category } of updates) {
    await tx.update(schema.casks).set({ category }).where(eq(schema.casks.id, id));
  }
});
```

---

### WR-03: `CategoryFilter` renders a `<button>` with `key={c.category}` — null category key causes React warning

**File:** `src/components/category-filter.tsx:65-73`
**Issue:** `getCategories()` filters out `NULL` categories in the query (`IS NOT NULL`), so in normal operation `c.category` should never be null in the rendered list. However, the TypeScript type `{ category: string | null }[]` (returned by the Drizzle `selectDistinct`) permits null. If a null ever leaks through (e.g., the `IS NOT NULL` filter is removed or the type is reused elsewhere), `key={c.category}` becomes `key={null}` which React coerces to `key="null"` — silently deduplicating any two null-category rows. More critically, `setCategory(c.category)` is called with `null`, which causes the "All Apps" deselection path to execute for an actual category button, breaking the filter logic.

Additionally, the button renders `{c.category}` directly — if a null were to render, it would produce an empty button with no label.

**Fix:** Add a null guard in the render:

```tsx
{categories
  .filter((c): c is { category: string } => c.category !== null)
  .map((c) => (
    <button
      key={c.category}
      onClick={() => setCategory(c.category)}
      style={isActive(c.category) ? pillActive : pillBase}
      aria-pressed={isActive(c.category)}
    >
      {c.category}
    </button>
  ))}
```

---

### WR-04: `getCaskByToken` cache key is not token-specific — all tokens share one stale-while-revalidate bucket

**File:** `src/lib/queries.ts:39-50`
**Issue:** `unstable_cache` is called with the static key `['cask-by-token']`. While `unstable_cache` appends the function arguments (the `token` string) to derive the full cache key, this base key string is the **cache tag group** identifier for on-demand invalidation. When `revalidateTag('casks')` is called, every cached cask detail page is invalidated simultaneously, which is the intended behavior. However, there is a naming inconsistency: the base key `'cask-by-token'` (singular, no `s`) means the ISR tag structure is `['cask-by-token', token]`, while all other query functions use the `'casks'` tag. This is correct and intentional. The real concern is that `unstable_cache` with `['cask-by-token']` as the base key and no `revalidate` duration set inherits the **route-level** `revalidate` setting. If the cask detail page ever sets `export const revalidate = 0` for any reason, this cache entry would bypass `unstable_cache` entirely. This is a latent fragility.

**Fix:** Add an explicit `revalidate` duration to the cache options as a safety net:

```typescript
export const getCaskByToken = unstable_cache(
  async (token: string) => { ... },
  ['cask-by-token'],
  { tags: ['casks'], revalidate: 3600 }
);
```

---

### WR-05: `formatRelativeDate` uses wall-clock `Date.now()` — produces different output on server vs. hydration

**File:** `src/app/cask/[token]/page.tsx:33-42`
**Issue:** `formatRelativeDate` computes the difference against `Date.now()` at render time. Since this function is called in a Server Component that is statically generated (`generateStaticParams` pre-renders top 500), the rendered string is computed at **build time** (e.g., "3 days ago"). When Next.js hydrates this on the client, the server-rendered HTML string is trusted as-is (no client-side re-render), so this is not a hydration mismatch. However, ISR pages are cached for the `revalidate` period: a page generated "3 days ago" and served from ISR cache will display "3 days ago" until re-validated, even if the actual last-synced timestamp has not changed. This means the "Last updated" string can be silently stale by the full ISR window.

This is not a crash but is a correctness issue: users may see "Last updated 3 days ago" on a page that was statically generated 6 hours ago and has not changed since.

**Fix:** Display the absolute date (which is already shown in the DETAILS section) instead of a relative string in the hero subtitle, or accept the staleness and document it. If relative time is required, compute it client-side via a `useEffect`-based component.

---

## Info

### IN-01: `AWS_REGION` env var ignored — hardcoded to `us-east-1`

**File:** `scripts/categorize-casks.ts:197`
**Issue:** The script header comment (line 18) instructs users to set `AWS_REGION`, but the `BedrockRuntimeClient` is constructed with `region: "us-east-1"` hardcoded. `process.env.AWS_REGION` is never read. Users in other regions will invoke Bedrock in `us-east-1` regardless of their setting, which may result in higher latency and unexpected cross-region charges.

**Fix:**
```typescript
region: process.env.AWS_REGION ?? 'us-east-1',
```

---

### IN-02: `SortDropdown` does not validate `currentSort` against `SORT_OPTIONS`

**File:** `src/components/sort-dropdown.tsx:10`
**Issue:** `currentSort` is typed as `string`, not `keyof typeof SORT_OPTIONS`. The server validates the sort param against a whitelist in `browse/page.tsx` before passing it down, so in practice only valid values are received. However the component itself accepts any string. If `currentSort` does not match any `SORT_OPTIONS` key, the `<select>` will render with no option selected (controlled value mismatch), which produces a React warning in development and potentially inconsistent visual state.

**Fix:** Narrow the type:
```typescript
export function SortDropdown({ currentSort }: { currentSort: keyof typeof SORT_OPTIONS }) {
```

---

### IN-03: Migration file does not include a `search_path` guard or idempotency check

**File:** `src/db/migrations/0002_add_category.sql`
**Issue:** The `ALTER TABLE` statement has no `IF NOT EXISTS` guard. Running the migration twice (e.g., after a failed deploy and retry) will produce `ERROR: column "category" of relation "casks" already exists`. Drizzle Kit tracks applied migrations via its journal, so in normal usage this will not trigger. However, manual re-runs or CI scenarios that bypass the journal will fail.

**Fix:** Add a conditional guard or rely entirely on Drizzle Kit's migration journal (document which approach is the project standard).

---

_Reviewed: 2026-05-27T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
