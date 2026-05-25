# Phase 3: Search + Security - Research

**Researched:** 2026-05-25
**Domain:** Postgres full-text search (tsvector/GIN), Next.js App Router URL state, Vercel WAF
**Confidence:** HIGH (except SRCH-02 platform filter — see critical finding below)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Search UX**
- D-01: Search filters the browse grid in place. Results stay on `/browse`, URL updates with `?q=vscode`. No separate `/search` page.
- D-02: Live as-you-type with ~300ms debounce. Fires a request after the user pauses typing, not on every keystroke.
- D-03: When search is active, pagination is hidden. Search shows up to a capped set of results (no paging). Pagination only appears when `?q` param is absent.
- D-04: The header search input (currently `disabled` placeholder) becomes a client component that manages the query string via `useRouter` / `useSearchParams`.

**Search Backend**
- D-05: Postgres full-text search using `tsvector`. NOT `ILIKE` — fuzzy/ranked matching is preferred.
- D-06: Schema migration: add `search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(name,'') || ' ' || coalesce(description,''))) STORED` column to the `casks` table.
- D-07: GIN index on `search_vector` for fast `@@` queries.
- D-08: New API route `/api/search?q=...` returns full cask rows for matching casks (all columns — no partial projection). Protected by the existing SSRF/allowlist wrapper.
- D-09: Search query uses `plainto_tsquery('english', $1)` against the `search_vector` column — tolerates natural phrasing without requiring tsquery syntax from users.
- D-10: Result cap: 50 results max. Ordered by `ts_rank(search_vector, query) DESC` then `install_365d DESC` as tiebreaker.

**Page Transition Jank**
- D-11: Add `loading.tsx` to both `/browse` and `/cask/[token]` routes. Next.js App Router uses these as instant Suspense fallbacks during server render.
- D-12: Loading state: skeleton card grid — N placeholder cards with shimmer/pulse animation matching the real `CaskCard` layout. No layout shift between skeleton and real content.
- D-13: Both routes get loading states: `/browse` (pagination transitions) and `/cask/[token]` (opening a cask detail page).

**WAF / Security**
- D-14: Enable Vercel WAF managed rulesets only. No custom rules in this phase.
- D-15: Rate limiting (SECU-01 via `@upstash/ratelimit`) deferred.

### Claude's Discretion
- Exact debounce duration (300ms recommended)
- Skeleton shimmer implementation (CSS animation or Tailwind `animate-pulse`)
- Whether to show a result count ("14 results for 'vscode'") in the browse grid header
- Minimum query length before search fires (suggest: 2 chars)
- Empty search state copy and icon
- Error state if `/api/search` fails (suggest: silent fallback to full browse grid)

### Deferred Ideas (OUT OF SCOPE)
- Rate limiting (SECU-01) — deferred by user decision
- Custom WAF rules (SECU-02 extended) — only managed rulesets in this phase
- Full-text description search (SRCH-03) — marked v2
- Sort controls (BRWS-03) — Phase 4
- Category filter (BRWS-02) — Phase 4
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SRCH-01 | User can search casks by name and get results from the database (server-side) | D-05 through D-10 give full implementation path: tsvector generated column + GIN index + `/api/search` route + plainto_tsquery + ts_rank ordering |
| SRCH-02 | User can filter search results by macOS platform compatibility | **Critical finding: no `platforms` column exists in the schema; Homebrew API provides architecture data only via `variations` key structure which was not ingested. See Platform Filter section below.** |
| SECU-01 | All API routes protected by per-IP rate limiting | **Deferred by D-15 — NOT in scope for this phase** |
| SECU-02 | Vercel WAF rules configured to block known bot patterns | **Critical finding: WAF managed rulesets require Enterprise plan — not available on Hobby or Pro. See WAF section below.** |
</phase_requirements>

---

## Summary

Phase 3 implements search and WAF hardening. The core search path — tsvector generated column, GIN index, `/api/search` route, debounced client-side trigger via URL params — is well-understood and fully supported by the existing stack. No new packages are required; every dependency is already in `package.json`.

Two critical blockers require planner attention before finalizing scope:

**SRCH-02 platform filter:** The `casks` table has no `platforms` column, and the Homebrew sync pipeline (`homebrew.ts`) does not ingest `variations` or `depends_on` data. Delivering SRCH-02 as written would require a schema migration to add platform data AND a backfill sync — which is out of scope for this phase. The planner must either add the ingestion work or reinterpret SRCH-02 as showing a static "macOS" label (which already renders in `CaskCard`).

**SECU-02 WAF managed rulesets:** Vercel WAF managed rulesets (OWASP core, bot protection, AI bots) require the **Enterprise plan**. The current deployment is Hobby/Pro. D-14 says "enable managed rulesets only" but this cannot be done without an Enterprise upgrade. The planner must flag this for user decision: either upgrade to Enterprise, implement custom WAF rules (up to 40 on Pro), or descope SECU-02 for this phase.

**Primary recommendation:** Deliver SRCH-01 (full-text search) and the loading skeleton states (D-11–13) in full. For SRCH-02, show the static "macOS" chip already present in CaskCard — defer real platform filtering. For SECU-02, implement Pro-tier WAF custom rules targeting common bot User-Agents as the closest available substitute for managed rulesets.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Search input + URL state | Browser/Client | — | `useSearchParams` / `useRouter` in `'use client'` component; can't access search params from layout server component |
| Debounce logic | Browser/Client | — | Timer-based, purely client-side concern |
| Search API route (`/api/search`) | API/Backend | — | Postgres query via Drizzle; must be server-side to avoid exposing DB |
| tsvector column + GIN index | Database/Storage | — | Generated column lives in Neon Postgres; indexed at DB layer |
| Browse page (read `?q` param) | Frontend Server (SSR) | — | `page.tsx` is a Server Component that reads `searchParams` prop |
| Loading skeletons | Frontend Server (SSR) | — | `loading.tsx` are Server Components wrapping route segments in Suspense |
| WAF managed rulesets | CDN/Edge | — | Vercel WAF executes before requests reach the application |

---

## Standard Stack

### Core (all already in package.json — no new installs)

| Library | Version in project | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| drizzle-orm | 0.45.2 | SQL query builder + schema | Existing ORM; `customType` + `.generatedAlwaysAs()` support tsvector columns [VERIFIED: orm.drizzle.team/docs/generated-columns] |
| drizzle-kit | 0.31.10 | Schema migrations | `drizzle-kit generate` + `migrate` for the tsvector column; `push` also works for Postgres generated columns (no documented limitations for PG) [VERIFIED: orm.drizzle.team/docs/generated-columns] |
| next | 16.2.6 | App Router, `loading.tsx`, API routes | `loading.tsx` convention provides instant Suspense fallbacks; `useSearchParams` for URL state [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/loading] |
| pg | 8.21.0 | Node Postgres driver (via drizzle) | Already configured in `src/db/index.ts` with Pool |
| zod | 4.4.3 | Input validation on `/api/search` | Already in project; validate `?q` query string |
| tailwindcss | v4 | Skeleton pulse animations | `animate-pulse` utility; already configured |

### No new packages required

This phase introduces zero new `npm install` commands. All necessary tooling is already present.

### Version verification

All packages confirmed via npm registry on 2026-05-25:
- drizzle-orm: 0.45.2 (current) [VERIFIED: npm registry]
- drizzle-kit: 0.31.10 (current) [VERIFIED: npm registry]
- zod: 4.4.3 (current) [VERIFIED: npm registry]
- next: 16.2.6 (current) [VERIFIED: npm registry]

---

## Package Legitimacy Audit

No new packages are installed in this phase. All libraries used are already present in `package.json` and were verified clean in earlier phases.

| Package | Registry | slopcheck | Disposition |
|---------|----------|-----------|-------------|
| drizzle-orm | npm | [OK] | Approved — already installed |
| drizzle-kit | npm | [OK] | Approved — already installed |
| zod | npm | [OK] | Approved — already installed |
| next | npm | [OK] | Approved — already installed |
| react | npm | [OK] | Approved — already installed |
| react-dom | npm | [OK] | Approved — already installed |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client)
  │
  │  user types in <SearchInput> ('use client')
  │  → 300ms debounce
  │  → router.replace('/browse?q=vscode')         [URL write: useRouter]
  │
  ▼
Next.js Browse Page (Server Component)
  │
  │  reads searchParams.q via page props
  │  if q present → fetch /api/search?q=vscode
  │  if q absent  → getCasksPage(page)            [ISR-cached]
  │  hides <Pagination> when q is set
  │
  ▼
/api/search Route Handler (Server)
  │
  │  validates q param (Zod: min 2 chars, max 100)
  │  builds plainto_tsquery
  │  queries Neon Postgres via Drizzle
  │
  ▼
Neon Postgres
  │
  │  search_vector column (tsvector GENERATED ALWAYS AS STORED)
  │  GIN index on search_vector
  │  WHERE search_vector @@ plainto_tsquery('english', $1)
  │  ORDER BY ts_rank DESC, install_365d DESC
  │  LIMIT 50
  │
  ▼
JSON response → <CaskGrid> renders results
```

### Recommended Project Structure (new files only)

```
src/
├── components/
│   └── search-input.tsx        # 'use client' island; debounced input; writes ?q to URL
├── app/
│   ├── browse/
│   │   └── loading.tsx         # Skeleton grid (N pulse cards matching CaskCard layout)
│   └── cask/
│       └── [token]/
│           └── loading.tsx     # Skeleton hero + stats placeholders
│   └── api/
│       └── search/
│           └── route.ts        # GET /api/search?q=... → Drizzle tsvector query
└── db/
    └── schema.ts               # Add search_vector generated column + GIN index
```

`queries.ts` gets a new `searchCasks(q: string)` export following the `getCasksPage` pattern.

### Pattern 1: Drizzle tsvector Generated Column

**What:** A Postgres `GENERATED ALWAYS AS ... STORED` column that auto-populates a tsvector from name + description. Never written manually; updated by Postgres when the row changes.

**When to use:** Whenever you need fast full-text search on an existing table without adding application-layer indexing overhead.

**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/generated-columns
import { SQL, sql } from 'drizzle-orm';
import { customType, pgTable, text, integer, boolean, timestamp, serial } from 'drizzle-orm/pg-core';

// Step 1: declare the tsvector custom type
const tsVector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

// Step 2: add to the existing casks table definition
export const casks = pgTable(
  'casks',
  {
    // ... existing columns unchanged ...
    search_vector: tsVector('search_vector').generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${casks.name}, '') || ' ' || coalesce(${casks.description}, ''))`
    ),
  },
  (t) => [
    // Step 3: GIN index — must be declared in table-level function
    index('idx_casks_search_vector').using('gin', t.search_vector),
  ]
);
```

**Migration approach:** Use `drizzle-kit generate` to produce a versioned `.sql` migration file, then `drizzle-kit migrate` to apply it. Postgres has no documented limitations for `push` with generated columns, but `generate + migrate` is preferred for production (produces auditable history). The generated SQL will be:

```sql
ALTER TABLE "casks" ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", ''))) STORED;

CREATE INDEX "idx_casks_search_vector" ON "casks" USING gin ("search_vector");
```

**Important:** The generated column is NOT listed in `$inferInsert` — Drizzle knows it's generated and omits it from INSERT/UPDATE statements automatically. The existing sync pipeline requires no changes.

### Pattern 2: Search Query with ts_rank

**What:** Query the `search_vector` column using `plainto_tsquery`, rank by relevance, then by install count as a tiebreaker.

**When to use:** For the `/api/search` route handler.

**Example:**
```typescript
// Source: https://orm.drizzle.team/docs/sql#raw-sql (verified pattern)
import { sql, desc } from 'drizzle-orm';

export async function searchCasks(q: string): Promise<CaskSelectRow[]> {
  const query = sql`plainto_tsquery('english', ${q})`;
  return db
    .select()
    .from(casks)
    .where(
      sql`${casks.search_vector} @@ plainto_tsquery('english', ${q})`
    )
    .where(eq(casks.is_active, true))
    .orderBy(
      sql`ts_rank(${casks.search_vector}, plainto_tsquery('english', ${q})) DESC`,
      desc(casks.install_365d)
    )
    .limit(SEARCH_RESULT_CAP);
}
```

Note: Drizzle's `and()` helper composes `.where()` clauses. Use `and(eq(casks.is_active, true), sql`...`)` in a single `.where()` call to avoid overwriting.

### Pattern 3: `useSearchParams` Client Island

**What:** Extract the search input into a `'use client'` component that reads `?q` via `useSearchParams` and writes via `useRouter.replace()`.

**Critical requirement:** Any component that calls `useSearchParams` **must** be wrapped in a `<Suspense>` boundary in its parent. Failing to do this causes a build error in production: `Missing Suspense boundary with useSearchParams`. [VERIFIED: nextjs.org/docs/app/api-reference/functions/use-search-params]

**Where this applies here:** The `<SearchInput>` client island will be rendered inside `<Header>`. The `Header` component is currently a Server Component used by the root layout. The layout does not receive `searchParams` and cannot be made dynamic. The safest path is:

1. Extract `<SearchInput>` as a `'use client'` component
2. Import it into `header.tsx` wrapped in `<Suspense fallback={<SearchInputPlaceholder />}>`
3. `header.tsx` itself remains a Server Component (or becomes a wrapper that renders a client island)

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/functions/use-search-params
// src/components/search-input.tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

export function SearchInput() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get('q') ?? '');

  // Sync local state when URL changes (e.g., browser back)
  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setValue(v);
    // Debounce handled via useEffect + setTimeout in real impl
    const params = new URLSearchParams(searchParams.toString());
    if (v.length >= 2) {
      params.set('q', v);
      params.delete('page'); // reset pagination when searching
    } else {
      params.delete('q');
    }
    router.replace(pathname + '?' + params.toString(), { scroll: false });
  }, [searchParams, router, pathname]);

  return <input type="text" value={value} onChange={handleChange} />;
}
```

**Note on `router.replace` vs `router.push`:** Use `replace` (not `push`) for live search so each keystroke does not add a history entry. Users expect "back" to return to the pre-search browse state, not to cycle through query states.

### Pattern 4: loading.tsx Skeleton

**What:** A `loading.tsx` file co-located with `page.tsx` is automatically wrapped in a `<Suspense>` boundary by Next.js App Router. It renders as the fallback while the page's async data fetching resolves. [VERIFIED: nextjs.org/docs/app/api-reference/file-conventions/loading]

**Key constraint:** `loading.tsx` is a Server Component by default. It does not accept params or receive route context. It must render a static layout that visually matches the real page structure to avoid layout shift.

**Example (browse skeleton):**
```typescript
// src/app/browse/loading.tsx
export default function BrowseLoading() {
  const SKELETON_COUNT = 12; // match typical PAGE_SIZE visible above fold
  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
          <div key={i} className="animate-pulse" style={{
            display: 'flex', gap: '16px', padding: '20px',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: '14px',
          }}>
            {/* Icon skeleton */}
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--color-border)', flexShrink: 0 }} />
            {/* Text lines skeleton */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
              <div style={{ height: 16, borderRadius: 4, background: 'var(--color-border)', width: '55%' }} />
              <div style={{ height: 12, borderRadius: 4, background: 'var(--color-border)', width: '85%' }} />
              <div style={{ height: 12, borderRadius: 4, background: 'var(--color-border)', width: '60%' }} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

### Anti-Patterns to Avoid

- **`useSearchParams` outside Suspense in production:** Works in dev, silently fails at build time. Always wrap in `<Suspense>`. [VERIFIED: nextjs.org/docs/app/api-reference/functions/use-search-params]
- **`router.push` for live search:** Creates a history entry per keystroke; always use `router.replace` for query-as-you-type patterns.
- **Calling `useSearchParams` from a Layout Server Component:** Layout Server Components do not receive `searchParams` — they cannot be made dynamic per route. The client island pattern is the correct solution.
- **Chaining `.where()` calls in Drizzle:** Each call overwrites the previous. Use `and(condition1, condition2)` inside a single `.where()`. [ASSUMED — common Drizzle pitfall from training data; verify in Drizzle docs if unsure]
- **Wrapping `searchCasks` in `unstable_cache`:** Search results are query-specific and must be fresh. Do not cache search results with ISR tags. Unlike `getCasksPage`, `searchCasks` should be a plain async function.
- **Overriding `?page` when search clears:** When the user clears `?q`, reset `?page` to 1 to avoid showing an empty page from a prior pagination state.

---

## Critical Findings

### Finding 1: WAF Managed Rulesets Require Enterprise — NOT Pro

**Confirmed from official Vercel docs (2026-02-27):** WAF Managed Rulesets (OWASP core, Bot Protection, AI Bots) show `N/A` for both Hobby and Pro plans. The table reads:

| Feature | Hobby | Pro | Enterprise |
|---------|-------|-----|------------|
| WAF Managed Rulesets | N/A | N/A | Contact sales |

[VERIFIED: vercel.com/docs/vercel-firewall/vercel-waf — last_updated 2026-02-27]
[VERIFIED: vercel.com/pricing — confirmed Enterprise-only]

**Impact on D-14:** D-14 says "Enable Vercel WAF managed rulesets only" but this cannot be done on Hobby or Pro plans. The planner must flag this for user decision:

**Option A — Custom WAF rules (Pro, up to 40 rules):** Create rules targeting known bot User-Agents (scrapers, AI crawlers, scanner tools) and abusive request patterns. Achieves partial SECU-02 coverage without a plan upgrade.

**Option B — Upgrade to Enterprise:** Enables the full OWASP Core Ruleset + Bot Protection Managed Ruleset with a single toggle. Required for the exact behavior D-14 describes. This involves contacting Vercel sales.

**Option C — Document as blocked:** Mark SECU-02 as blocked pending plan upgrade. Implement no WAF changes. Revisit when traffic patterns justify cost.

The planner should present this choice to the user before generating tasks for SECU-02.

### Finding 2: No Platform/Architecture Data in the Database for SRCH-02

**Current schema state:** The `casks` table has no `platforms`, `arch`, `variations`, or `depends_on` columns. The Homebrew sync pipeline (`homebrew.ts`) ingests only: `token`, `name[0]`, `desc`, `homepage`, `version`, `deprecated`, `disabled`, and analytics counts.

**Homebrew API reality:** Platform/architecture information in the Homebrew cask API lives in the `variations` key (e.g., `"arm64_big_sur"`, `"sequoia"`, `"sonoma"` as keys) and in `depends_on.macos`. These fields were not ingested in Phase 1.

**Confirmed from API inspection:**
- VSCode: `variations` has macOS-version-keyed entries (arm64 inferred from base URL containing `darwin-arm64`)
- 1Password: variations keyed by macOS release names (arm64 base, x86_64 in variations)
- iTerm2, Firefox: `variations: {}` (empty — universal binaries)
[VERIFIED: formulae.brew.sh/api/cask/*.json — live API responses]

**Impact on SRCH-02:** Implementing a real arm64/x86_64 filter requires:
1. Schema migration to add `arch_arm64 boolean`, `arch_x86_64 boolean`, or a `platforms text[]` column
2. Backfill logic in the sync pipeline to parse `variations` keys and `url` strings for architecture hints
3. API route changes to accept `?platform=arm64`

This is a Phase 1 backfill concern, not a Phase 3 search concern. The planner should either:
- Add the schema + sync backfill tasks as a prerequisite within Phase 3 (adds significant scope)
- Treat SRCH-02 as "macOS filter" showing the existing static chip — the existing `CaskCard` already renders a `macOS` pill; clicking it could become a visual noop or placeholder

The CONTEXT.md's success criterion for SRCH-02 reads: "Search results can be filtered to show only casks compatible with a specific macOS platform (e.g., arm64, x86_64)." Without the data ingestion work, this cannot be built truthfully.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Full-text ranking | Custom scoring algorithm | `ts_rank()` SQL function | Postgres built-in; handles stemming, stop words, IDF weighting automatically |
| Query sanitization | String escaping | `plainto_tsquery()` | Safely parses natural language; parameterized via Drizzle's `sql` tag prevents injection |
| GIN index management | Manual index creation in app code | `drizzle-kit generate/migrate` SQL | Migration files are auditable; index created once at DB level, not per-request |
| URL state management | Custom event bus or global state | `useSearchParams` + `useRouter` | Native Next.js App Router pattern; handles SSR hydration correctly |
| Loading state Suspense | Manual `useState(loading)` + conditional render | `loading.tsx` convention | Next.js wraps it in Suspense automatically; no hydration issues; prefetched |
| Debounce implementation | `setTimeout` manual management | `useCallback` + `useEffect` cleanup pattern | Standard React idiom; cancels pending timer on fast keystrokes |

**Key insight:** Postgres tsvector + Drizzle's `customType` covers the entire search domain. The only application-layer code needed is the query construction and result rendering — Postgres handles ranking, stemming, and index traversal.

---

## Common Pitfalls

### Pitfall 1: `useSearchParams` Build Failure

**What goes wrong:** Component calling `useSearchParams` is not wrapped in `<Suspense>`. Works in `next dev` (development renders routes on-demand). Fails at `next build` with: `Missing Suspense boundary with useSearchParams`.

**Why it happens:** In production, static routes are prerendered. `useSearchParams` causes client-side rendering. Without a Suspense boundary, Next.js can't emit valid streaming HTML.

**How to avoid:** Always wrap the component (or its parent) in `<Suspense fallback={<SearchInputPlaceholder />}>`. The placeholder should visually match the input dimensions to prevent layout shift.

**Warning signs:** No build error in dev — only caught in `next build` or CI.

### Pitfall 2: `router.push` vs `router.replace` for Live Search

**What goes wrong:** Using `router.push` for live-as-you-type search creates one browser history entry per debounce tick. User hits "back" expecting to leave the browse page but instead cycles through 8 intermediate query states.

**Why it happens:** `push` adds to history stack; `replace` updates the current entry.

**How to avoid:** Use `router.replace('/browse?' + params.toString(), { scroll: false })` in the search handler.

**Warning signs:** Pressing "back" once doesn't leave the browse page.

### Pitfall 3: Multiple `.where()` Calls Overwrite Each Other in Drizzle

**What goes wrong:** Writing `.where(eq(casks.is_active, true)).where(sql`...tsvector...`)` — the second `.where()` silently replaces the first. The `is_active` filter is dropped.

**Why it happens:** Drizzle's `.where()` is not cumulative; it sets, not appends.

**How to avoid:** Use `and()` imported from `drizzle-orm`:
```typescript
.where(and(
  eq(casks.is_active, true),
  sql`${casks.search_vector} @@ plainto_tsquery('english', ${q})`
))
```

**Warning signs:** Inactive/deprecated casks appearing in search results.

### Pitfall 4: Generated Column in INSERT/UPDATE Statements

**What goes wrong:** Attempting to set `search_vector` in a Drizzle insert or update (e.g., copying a `CaskInsertRow` shape that includes the column) causes a Postgres error: `cannot insert into column "search_vector"`.

**Why it happens:** Generated columns are managed by Postgres, not the application. Drizzle should automatically exclude them from `$inferInsert`, but explicit type assertions or raw inserts might include them.

**How to avoid:** Do not include `search_vector` in any INSERT or UPDATE. Verify the Drizzle `$inferInsert` type does not include it after schema change.

**Warning signs:** Postgres error `ERROR: cannot insert into column "search_vector"` during sync.

### Pitfall 5: tsvector Column Not Populated on Existing Rows

**What goes wrong:** After running `ALTER TABLE ... ADD COLUMN search_vector tsvector GENERATED ALWAYS AS ... STORED`, existing rows have the column populated immediately (Postgres computes STORED generated columns on the ALTER itself). However, if the migration runs against a large table, it may take significant time and lock the table.

**Why it happens:** `STORED` generated columns are populated synchronously at migration time for all existing rows.

**How to avoid:** Run the migration during low-traffic period. On Neon, the table lock is released after the ALTER completes. For 7,000 cask rows, this is fast (seconds). Monitor migration duration.

**Warning signs:** Long migration time; table temporarily unavailable.

### Pitfall 6: Empty Query String Causing Invalid `plainto_tsquery`

**What goes wrong:** Calling `plainto_tsquery('english', '')` returns an empty tsquery, and `search_vector @@ ''::tsquery` returns true for ALL rows. This bypasses the search intent and returns all active casks (up to the LIMIT 50 cap).

**Why it happens:** The API route receives `?q=` (empty string) and passes it to Postgres.

**How to avoid:** Validate the `q` param server-side: minimum 2 characters (matching the client-side minimum). Return 400 or empty array for queries below minimum length.

```typescript
// In /api/search/route.ts
const q = searchParams.get('q') ?? '';
if (q.trim().length < 2) {
  return Response.json({ results: [] }, { status: 200 });
}
```

---

## Code Examples

### tsvector Schema Definition (Drizzle)

```typescript
// Source: https://orm.drizzle.team/docs/generated-columns
import { SQL, sql } from 'drizzle-orm';
import { customType, index, pgTable, text, integer, boolean, timestamp, serial } from 'drizzle-orm/pg-core';

const tsVector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

export const casks = pgTable(
  'casks',
  {
    id:               serial('id').primaryKey(),
    token:            text('token').notNull().unique(),
    name:             text('name').notNull(),
    description:      text('description'),
    // ... other existing columns ...
    search_vector: tsVector('search_vector').generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${casks.name}, '') || ' ' || coalesce(${casks.description}, ''))`
    ),
  },
  (t) => [
    index('idx_casks_search_vector').using('gin', t.search_vector),
  ]
);
```

### searchCasks Query

```typescript
// Source: https://orm.drizzle.team/docs/sql#raw-sql
import { and, desc, eq, sql } from 'drizzle-orm';

export const SEARCH_RESULT_CAP = 50;

/** Full-text search over cask name + description using tsvector/GIN. */
export async function searchCasks(q: string): Promise<CaskSelectRow[]> {
  return db
    .select()
    .from(casks)
    .where(
      and(
        eq(casks.is_active, true),
        sql`${casks.search_vector} @@ plainto_tsquery('english', ${q})`
      )
    )
    .orderBy(
      sql`ts_rank(${casks.search_vector}, plainto_tsquery('english', ${q})) DESC`,
      desc(casks.install_365d)
    )
    .limit(SEARCH_RESULT_CAP);
}
```

### /api/search Route Handler

```typescript
// src/app/api/search/route.ts
import { NextRequest } from 'next/server';
import { searchCasks } from '@/lib/queries';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (q.trim().length < 2) {
    return Response.json({ results: [] });
  }
  try {
    const results = await searchCasks(q.trim());
    return Response.json({ results });
  } catch (err) {
    console.error('Search error:', err);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

### Browse Page with Search Branching

```typescript
// src/app/browse/page.tsx — extended with ?q support
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;

  if (q && q.trim().length >= 2) {
    // Search mode: no pagination, up to 50 results
    const results = await searchCasks(q.trim()); // not cached
    return (
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
        {/* Optional: result count header */}
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{q}&rdquo;
        </p>
        <CaskGrid casks={results} />
      </main>
    );
  }

  // Normal paginated browse (existing logic unchanged)
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
  // ...
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ILIKE '%query%'` substring search | `tsvector` + `plainto_tsquery` + `ts_rank` | Postgres 8.3+ | Stemming, ranking, stop words, no leading wildcard performance cliff |
| Client-side Fuse.js search over full JSON dump | Server-side Postgres FTS | This project's decision | Avoids shipping 15.5 MB JSON to browser; scales to 17K casks |
| `next/router` (Pages Router) | `useRouter` from `next/navigation` (App Router) | Next.js 13 | Different import path; `query` object replaced by `useSearchParams` |
| `router.push` for query updates | `router.replace` for live search | App Router best practice | Prevents history stack pollution on keystroke-driven updates |
| `export const dynamic = 'force-dynamic'` | `await connection()` (next/server) | Next.js 15+ | Semantically ties dynamic rendering to incoming request; more explicit |
| Global spinner during navigation | `loading.tsx` per route segment | Next.js 13 | Scoped loading states; layout remains interactive during transitions |

**Deprecated/outdated:**
- `@vercel/kv`: Deprecated December 2024; migrated to Upstash. Do not use. (Not relevant to this phase but noted from CLAUDE.md)
- Vercel WAF "custom rules = 3 on Hobby": Confirmed current. Do not assume managed rulesets exist on Hobby/Pro.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle's `.where()` is non-cumulative (second call overwrites first) | Pitfall 3 | Code would silently drop the is_active filter; deprecated casks appear in search results |
| A2 | `drizzle-kit push` works for adding a generated column + GIN index to Postgres with no limitations (unlike MySQL/SQLite) | Standard Stack | Migration might fail; fall back to raw SQL ALTER TABLE |
| A3 | The `search_vector` field will be automatically excluded from `CaskInsertRow` type after adding `.generatedAlwaysAs()` | Pitfall 4 | Sync pipeline would break with Postgres error on insert |
| A4 | `router.replace` with `{ scroll: false }` prevents page scroll-to-top on each search keystroke | Pattern 3 | Minor UX issue: page scrolls to top on each debounce tick |

---

## Open Questions

1. **SECU-02 WAF Plan Tier**
   - What we know: Managed rulesets require Enterprise. D-14 says "enable managed rulesets only."
   - What's unclear: Is the user on Enterprise, or should we substitute Pro-tier custom WAF rules?
   - Recommendation: Planner should present the three options (Enterprise upgrade / custom rules on Pro / defer) and surface to user before generating WAF tasks. Do not silently skip SECU-02.

2. **SRCH-02 Platform Filter — Scope Clarification**
   - What we know: No platform/arch column exists; Homebrew variations data was not ingested; real arm64/x86_64 filtering requires schema + sync changes.
   - What's unclear: Does the user expect real platform filtering (requires Phase 1 backfill work) or a visual "macOS" indicator (already exists in CaskCard)?
   - Recommendation: Treat SRCH-02 as "show macOS compatibility context" using the existing static chip. Document that real platform filtering is a follow-up. Do not silently skip the requirement.

3. **`drizzle-kit push` vs `generate + migrate` for the tsvector column**
   - What we know: Postgres has no documented push limitations for generated columns. `generate + migrate` is the recommended production path.
   - What's unclear: Does the project use `push` or `migrate` in production? The drizzle.config.ts has an `out: ./src/db/migrations` directory (implying generate/migrate), but no migrations exist yet.
   - Recommendation: Use `drizzle-kit generate` to produce the SQL file, commit it, then run `drizzle-kit migrate` (or run the SQL directly against Neon). Include the migration file in the task output.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js build + dev | Yes | v24.11.0 | — |
| psql CLI | Manual DB inspection | Yes | PostgreSQL 15.18 | Run SQL via Neon console |
| Neon Postgres | tsvector migration + search queries | Assumed (credentials in .env.local) | — | — |
| Vercel Pro/Enterprise plan | SECU-02 WAF managed rulesets | Unknown — see Open Question 1 | — | Custom WAF rules (Pro) or defer |
| drizzle-kit | Schema migration | Yes (devDependency 0.31.10) | 0.31.10 | — |

**Missing dependencies with no fallback:**
- Neon database connection: Assumed available but not verified in this environment (no live DB probe performed). Planner should include a connectivity smoke-test step before migration.

**Missing dependencies with fallback:**
- Vercel WAF managed rulesets: Enterprise-only. Fallback is Pro custom rules or deferral.

---

## Security Domain

This phase's search route (`/api/search`) is a public API endpoint. SECU-01 (rate limiting) is explicitly deferred. The following controls apply:

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | Zod validation on `?q` param; minimum/maximum length enforced before hitting DB |
| V4 Access Control | Partial | `/api/search` is public read-only; no auth required. Cron + revalidate routes retain existing CRON_SECRET guard. |
| V6 Cryptography | No | No cryptographic operations in this phase |
| V2 Authentication | No | No write operations; public catalog read |
| V3 Session Management | No | No sessions |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| tsquery injection via `?q` param | Tampering | `plainto_tsquery()` sanitizes input; Drizzle parameterizes the value — `${q}` becomes `$1`. Never concatenate into raw SQL string. |
| Amplification via expensive search query | Denial of Service | `LIMIT 50` hard cap; GIN index ensures constant-time lookup. `plainto_tsquery` is O(n) in query length, not corpus size. |
| Empty string query returning all rows | Tampering | 2-character minimum enforced at route handler before query execution. |
| SSRF via `/api/search` | Spoofing | Route queries only Neon Postgres via Drizzle — no external HTTP fetch involved. SSRF allowlist (`fetch-allowlist.ts`) is irrelevant here but remains in place for other routes. |

**Note on WAF:** If SECU-02 is implemented via Pro custom rules, consider adding rules for:
- User-Agent strings of known scrapers (GPTBot, CCBot, Bytespider, AhrefsBot, SemrushBot)
- Requests with no `Accept` header (common bot signature)
- Rate limiting by IP on `/api/*` paths (30–60 req/min threshold)

---

## Sources

### Primary (HIGH confidence)
- `https://orm.drizzle.team/docs/generated-columns` — tsvector customType + generatedAlwaysAs() syntax; GIN index declaration; Postgres has no push limitations for generated columns
- `https://nextjs.org/docs/app/api-reference/functions/use-search-params` — useSearchParams Suspense requirement; createQueryString pattern; router.replace for URL updates (v16.2.6, last updated 2026-05-19)
- `https://nextjs.org/docs/app/api-reference/file-conventions/loading` — loading.tsx Suspense convention; Server Component by default; wraps page.tsx automatically (v16.2.6, last updated 2026-05-19)
- `https://nextjs.org/docs/app/api-reference/functions/use-router` — router.replace vs push; scroll: false option (v16.2.6, last updated 2026-05-19)
- `https://vercel.com/docs/vercel-firewall/vercel-waf` — WAF plan limits table; managed rulesets = Enterprise only (last updated 2026-02-27)
- `https://vercel.com/docs/vercel-firewall/vercel-waf/managed-rulesets` — Exact toggle steps for OWASP, Bot Protection, AI Bots rulesets (last updated 2026-02-27)
- `https://orm.drizzle.team/docs/sql#raw-sql` — sql tag for tsvector @@ plainto_tsquery queries; parameterized values
- npm registry (2026-05-25) — drizzle-orm 0.45.2, drizzle-kit 0.31.10, zod 4.4.3, next 16.2.6 confirmed current

### Secondary (MEDIUM confidence)
- `https://formulae.brew.sh/api/cask/{token}.json` (live API, vscode / iterm2 / firefox / 1password / parallels) — confirmed no `platforms` field; `variations` contains macOS-version-keyed arch data; most casks have empty variations
- `https://vercel.com/pricing` — WAF managed rulesets Enterprise-only confirmed from pricing comparison table

### Tertiary (LOW confidence — not used for critical claims)
- Training data: Postgres `plainto_tsquery` semantics (parses natural language to tsquery without requiring operators) — cross-verified with Drizzle sql tag docs

---

## Metadata

**Confidence breakdown:**
- tsvector schema + Drizzle migration: HIGH — official Drizzle docs confirmed exact syntax
- Next.js URL state (useSearchParams): HIGH — official Next.js docs confirmed Suspense requirement and pattern
- loading.tsx convention: HIGH — official Next.js docs confirmed behavior
- WAF managed rulesets plan requirement: HIGH — confirmed from official Vercel docs and pricing page
- SRCH-02 platform data availability: HIGH — confirmed from live Homebrew API inspection across 5 casks
- SECU-02 custom WAF rules as substitute: MEDIUM — Pro plan capability confirmed; specific bot UA list is training data

**Research date:** 2026-05-25
**Valid until:** 2026-06-25 (stable stack — 30 days). WAF pricing may change; re-verify at vercel.com/pricing before implementing SECU-02.
