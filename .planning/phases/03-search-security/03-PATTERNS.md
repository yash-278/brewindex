# Phase 3: Search + Security - Pattern Map

**Mapped:** 2026-05-25
**Files analyzed:** 8 (5 modified, 3 new)
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/db/schema.ts` | model | CRUD | `src/db/schema.ts` (itself, current state) | exact — add column + index |
| `src/lib/queries.ts` | service | CRUD | `src/lib/queries.ts` (getCasksPage / getCaskByToken) | exact — add new export |
| `src/app/api/search/route.ts` | route | request-response | `src/app/api/revalidate/route.ts` | role-match |
| `src/components/search-input.tsx` | component | event-driven | `src/components/header.tsx` (input stub) | partial — extract + make client |
| `src/components/header.tsx` | component | request-response | `src/components/header.tsx` (itself) | exact — swap disabled input for client island |
| `src/app/browse/page.tsx` | route (page) | request-response | `src/app/browse/page.tsx` (itself) | exact — extend searchParams branch |
| `src/app/browse/loading.tsx` | component | request-response | `src/app/cask/[token]/page.tsx` (layout structure) | role-match — mirror skeleton of grid |
| `src/app/cask/[token]/loading.tsx` | component | request-response | `src/app/cask/[token]/page.tsx` (layout structure) | role-match — mirror skeleton of detail |

---

## Pattern Assignments

### `src/db/schema.ts` (model, CRUD — add tsvector column + GIN index)

**Analog:** `src/db/schema.ts` (current state)

**Current imports** (lines 1-3):
```typescript
import {
  pgTable, text, integer, boolean, timestamp, serial,
} from 'drizzle-orm/pg-core';
```

**New imports to add** — three additional symbols required:
```typescript
import { SQL, sql } from 'drizzle-orm';
import { customType, index, pgTable, text, integer, boolean, timestamp, serial } from 'drizzle-orm/pg-core';
```

**Current table definition** (lines 5-23):
```typescript
export const casks = pgTable('casks', {
  id:               serial('id').primaryKey(),
  token:            text('token').notNull().unique(),
  name:             text('name').notNull(),
  description:      text('description'),
  version:          text('version'),
  homepage:         text('homepage'),
  icon_url:         text('icon_url'),
  icon_is_fallback: boolean('icon_is_fallback').notNull().default(false),
  install_30d:      integer('install_30d'),
  install_90d:      integer('install_90d'),
  install_365d:     integer('install_365d'),
  github_stars:     integer('github_stars'),
  github_forks:     integer('github_forks'),
  github_issues:    integer('github_issues'),
  github_enriched:  boolean('github_enriched').notNull().default(false),
  is_active:        boolean('is_active').notNull().default(true),
  last_synced_at:   timestamp('last_synced_at').notNull().defaultNow(),
});
```

**Pattern to add** — custom tsvector type declaration (above the table), new column, and GIN index:
```typescript
// Declare BEFORE casks pgTable — customType must be hoisted
const tsVector = customType<{ data: string }>({
  dataType() { return 'tsvector'; },
});

export const casks = pgTable(
  'casks',
  {
    // ... all existing columns unchanged ...
    search_vector: tsVector('search_vector').generatedAlwaysAs(
      (): SQL => sql`to_tsvector('english', coalesce(${casks.name}, '') || ' ' || coalesce(${casks.description}, ''))`
    ),
  },
  (t) => [
    index('idx_casks_search_vector').using('gin', t.search_vector),
  ]
);
```

**Existing type exports** (lines 25-26) — unchanged; `search_vector` is auto-excluded from `$inferInsert`:
```typescript
export type CaskInsertRow = typeof casks.$inferInsert;
export type CaskSelectRow = typeof casks.$inferSelect;
```

**Critical note:** The `generatedAlwaysAs` column must reference `casks.name` and `casks.description` by column object — not string. The self-reference works because Drizzle uses lazy evaluation for the `sql` tagged template in `generatedAlwaysAs`. Do NOT pass `search_vector` in any INSERT/UPDATE — Postgres manages it; Drizzle omits it from `$inferInsert` automatically.

---

### `src/lib/queries.ts` (service, CRUD — add searchCasks export)

**Analog:** `src/lib/queries.ts` — `getCasksPage` (lines 10-23) and `getCaskByToken` (lines 39-50)

**Current imports** (line 4) — extend with `sql` and `desc` already present; `and` and `eq` already imported:
```typescript
import { and, desc, eq, sql } from 'drizzle-orm';
```
No import changes needed.

**Existing query pattern to mirror — `getCasksPage`** (lines 10-23):
```typescript
export const getCasksPage = unstable_cache(
  async (page: number) => {
    const offset = (page - 1) * PAGE_SIZE;
    return db
      .select()
      .from(casks)
      .where(eq(casks.is_active, true))
      .orderBy(desc(casks.install_365d))
      .limit(PAGE_SIZE)
      .offset(offset);
  },
  ['casks-page'],
  { tags: ['casks'] }
);
```

**Existing multi-condition `.where()` pattern to mirror — `getCaskByToken`** (lines 39-50):
```typescript
export const getCaskByToken = unstable_cache(
  async (token: string) => {
    const result = await db
      .select()
      .from(casks)
      .where(and(eq(casks.is_active, true), eq(casks.token, token)))
      .limit(1);
    return result[0] ?? null;
  },
  ['cask-by-token'],
  { tags: ['casks'] }
);
```

**New export to add** — plain async function (NOT wrapped in `unstable_cache`; search must be fresh):
```typescript
/** Result cap for full-text search — single source of truth. */
export const SEARCH_RESULT_CAP = 50;

/** Full-text search over cask name + description using tsvector/GIN index.
 *  NOT cached — search results must be fresh per query.
 */
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

**Placement:** Add after `getTop500Tokens` at the bottom of the file.

**Anti-pattern to avoid:** Do NOT chain `.where()` calls — the second call overwrites the first. Use `and()` inside a single `.where()` call (as shown above and in `getCaskByToken`).

---

### `src/app/api/search/route.ts` (route, request-response — NEW)

**Analog:** `src/app/api/revalidate/route.ts` (entire file, 14 lines)

**Analog structure — revalidate route** (full file):
```typescript
import { revalidateTag } from "next/cache";
import type { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  // Auth guard first, before any work
  const authHeader = request.headers.get("authorization");
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag("casks", "max");

  return Response.json({ revalidated: true, now: Date.now() });
}
```

**Key differences for `/api/search`:**
- No auth guard — this is a public read-only endpoint
- Input validation via Zod on `?q` param (min 2 chars, max 100) before DB hit
- Uses `request.nextUrl.searchParams` (NextRequest feature) rather than headers
- Returns `{ results: CaskSelectRow[] }` JSON shape
- Error handling with try/catch and structured JSON error response (mirrors cron/sync pattern from `src/app/api/cron/sync/route.ts` lines 139-145)

**Pattern to copy — cron/sync error handling** (lines 139-145):
```typescript
  } catch (err) {
    console.error("[cron/sync] fatal error", err);
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
```

**Simplified version for search (use `Response.json` shorthand as in revalidate route):**
```typescript
import { NextRequest } from 'next/server';
import { searchCasks } from '@/lib/queries';
import { z } from 'zod';

const QuerySchema = z.object({
  q: z.string().min(2).max(100),
});

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('q') ?? '';
  const parsed = QuerySchema.safeParse({ q: raw.trim() });
  if (!parsed.success) {
    return Response.json({ results: [] });
  }
  try {
    const results = await searchCasks(parsed.data.q);
    return Response.json({ results });
  } catch (err) {
    console.error('[api/search] error:', err);
    return Response.json({ error: 'Search failed' }, { status: 500 });
  }
}
```

---

### `src/components/search-input.tsx` (component, event-driven — NEW)

**Analog:** `src/components/header.tsx` — the disabled input stub (lines 44-61)

**Disabled stub to replace/extract** (lines 44-61):
```typescript
{/* Search bar (disabled placeholder) */}
<input
  type="text"
  placeholder="Search casks…"
  disabled
  style={{
    flex: 1,
    maxWidth: '480px',
    opacity: 0.55,
    cursor: 'not-allowed',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '8px 12px',
    color: 'var(--color-text-muted)',
    fontSize: '0.8125rem',
  }}
/>
```

**Visual style to preserve exactly** — same inline style object minus `disabled`, `opacity: 0.55`, and `cursor: 'not-allowed'`; add `outline: 'none'` and `:focus` border color change.

**New file structure:**
```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

export function SearchInput() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get('q') ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when URL changes (browser back/forward)
  useEffect(() => {
    setValue(searchParams.get('q') ?? '');
  }, [searchParams]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setValue(v);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (v.trim().length >= MIN_QUERY_LENGTH) {
          params.set('q', v.trim());
          params.delete('page'); // reset pagination when searching
        } else {
          params.delete('q');
          params.delete('page');
        }
        router.replace(pathname + (params.toString() ? '?' + params.toString() : ''), { scroll: false });
      }, DEBOUNCE_MS);
    },
    [searchParams, router, pathname]
  );

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      placeholder="Search casks…"
      style={{
        flex: 1,
        maxWidth: '480px',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '8px',
        padding: '8px 12px',
        color: 'var(--color-text)',
        fontSize: '0.8125rem',
        outline: 'none',
      }}
    />
  );
}
```

**Critical requirement:** This component uses `useSearchParams` and MUST be wrapped in `<Suspense>` at the call site in `header.tsx`. Failing to do so causes a production build error: `Missing Suspense boundary with useSearchParams`.

---

### `src/components/header.tsx` (component, request-response — modify)

**Analog:** `src/components/header.tsx` (itself — current full file, 77 lines)

**Current full file** (lines 1-77):
```typescript
import Link from 'next/link';

export function Header({ caskCount }: { caskCount: number }) {
  return (
    <header style={{ position: 'sticky', top: 0, zIndex: 50, height: '56px',
      background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)',
      display: 'flex', alignItems: 'center', padding: '0 24px', gap: '24px' }}
    >
      {/* Logo */}
      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '10px',
        flexShrink: 0, textDecoration: 'none', color: 'inherit' }}>
        <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>🍺</span>
        <span style={{ fontSize: '1rem', fontWeight: 700, letterSpacing: '-0.02em',
          color: 'var(--color-text)' }}>BrewIndex</span>
      </Link>

      {/* Search bar (disabled placeholder) — REPLACE THIS BLOCK */}
      <input type="text" placeholder="Search casks…" disabled style={{ ... }} />

      {/* Cask count */}
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)',
        marginLeft: 'auto', flexShrink: 0 }}>
        {caskCount.toLocaleString()} casks
      </span>
    </header>
  );
}
```

**Change required:** Replace the disabled `<input>` (lines 44-61) with a `<Suspense>`-wrapped `<SearchInput>` client island. `header.tsx` itself stays a Server Component — no `'use client'` directive needed at the file level.

**Import additions required:**
```typescript
import { Suspense } from 'react';
import { SearchInput } from '@/components/search-input';
```

**Replacement block** — the disabled input becomes:
```typescript
{/* Search input client island — Suspense required for useSearchParams */}
<Suspense fallback={
  <input
    type="text"
    placeholder="Search casks…"
    disabled
    style={{
      flex: 1,
      maxWidth: '480px',
      opacity: 0.55,
      cursor: 'not-allowed',
      background: 'var(--color-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '8px 12px',
      color: 'var(--color-text-muted)',
      fontSize: '0.8125rem',
    }}
  />
}>
  <SearchInput />
</Suspense>
```

The Suspense fallback visually matches the stub exactly — no layout shift during hydration.

---

### `src/app/browse/page.tsx` (route page, request-response — modify)

**Analog:** `src/app/browse/page.tsx` (itself — current full file, 32 lines)

**Current full file** (lines 1-32):
```typescript
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { getCasksPage, getCasksCount, PAGE_SIZE } from '@/lib/queries';
import { CaskGrid } from '@/components/cask-grid';
import { Pagination } from '@/components/pagination';

export const metadata: Metadata = { title: 'Browse Casks — BrewIndex' };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const [pageCasks, totalCount] = await Promise.all([getCasksPage(page), getCasksCount()]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  if (page > totalPages && totalPages > 0) {
    redirect('/browse?page=' + totalPages);
  }

  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <CaskGrid casks={pageCasks} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </main>
  );
}
```

**Changes required:**
1. Extend `searchParams` type to include `q?: string`
2. Import `searchCasks` and `SEARCH_RESULT_CAP` from queries
3. Add search branch: if `q` present and length >= 2 → call `searchCasks`, return early without pagination

**Import additions:**
```typescript
import { getCasksPage, getCasksCount, PAGE_SIZE, searchCasks, SEARCH_RESULT_CAP } from '@/lib/queries';
```

**Extended searchParams type:**
```typescript
searchParams: Promise<{ page?: string; q?: string }>;
```

**Search branch to add at the top of the function body** (before the existing paginated logic):
```typescript
const { page: pageParam, q } = await searchParams;

// Search mode — branch taken when ?q is present and meets min length
if (q && q.trim().length >= 2) {
  const results = await searchCasks(q.trim());
  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
        {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{q.trim()}&rdquo;
      </p>
      <CaskGrid casks={results} />
      {/* No <Pagination> in search mode — D-03 */}
    </main>
  );
}

// Normal paginated browse continues below — existing logic unchanged
const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);
// ...
```

**Existing paginated logic is unchanged** — only the `const { page: pageParam }` destructure line needs updating to also destructure `q`.

---

### `src/app/browse/loading.tsx` (component, request-response — NEW)

**Analog:** `src/components/cask-card.tsx` (layout to mirror) + `src/app/browse/page.tsx` (main wrapper dimensions)

**CaskCard layout to mirror as skeleton** — key measurements extracted from `cask-card.tsx`:
- Card: `display: flex`, `gap: 16px`, `padding: 20px`, `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `borderRadius: 14px`
- Icon slot: `width: 52`, `height: 52`, `flexShrink: 0`, `marginTop: 2px`
- Card body: `flex: 1`, `minWidth: 0`, `flexDirection: column`, `gap: 8px`
- Name row: height ~16px (1rem font)
- Description: height ~24px (two lines, 0.8125rem, lineHeight 1.5)
- Metadata strip: height ~18px (0.6875rem pills)

**Grid wrapper from `cask-grid.tsx`** (line 31): `className="grid grid-cols-1 md:grid-cols-2 gap-3"`

**Browse page main wrapper from `browse/page.tsx`** (line 27): `style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}`

**Full new file pattern:**
```typescript
export default function BrowseLoading() {
  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse"
            style={{
              display: 'flex',
              gap: '16px',
              padding: '20px',
              background: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              borderRadius: '14px',
            }}
          >
            {/* Icon skeleton — mirrors CaskIcon 52x52 with marginTop: 2px */}
            <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--color-border)', flexShrink: 0, marginTop: 2 }} />
            {/* Text body skeleton */}
            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Name line */}
              <div style={{ height: 16, borderRadius: 4, background: 'var(--color-border)', width: '55%' }} />
              {/* Description line 1 */}
              <div style={{ height: 13, borderRadius: 4, background: 'var(--color-border)', width: '90%' }} />
              {/* Description line 2 */}
              <div style={{ height: 13, borderRadius: 4, background: 'var(--color-border)', width: '70%' }} />
              {/* Metadata strip — pill skeletons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <div style={{ height: 18, width: 72, borderRadius: 9999, background: 'var(--color-border)' }} />
                <div style={{ height: 18, width: 52, borderRadius: 9999, background: 'var(--color-border)' }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
```

**Note:** `animate-pulse` is Tailwind's built-in skeleton shimmer. No CSS module or custom keyframe needed.

---

### `src/app/cask/[token]/loading.tsx` (component, request-response — NEW)

**Analog:** `src/app/cask/[token]/page.tsx` (full layout structure, 469 lines — key sections extracted below)

**Detail page main wrapper** (page.tsx line 69-75):
```typescript
<main style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 48px' }}>
```

**Back navigation dimensions** (page.tsx lines 77-93): `paddingTop: 20px`, button height ~30px, `border: 1px solid var(--color-border)`, `borderRadius: 6px`.

**Hero section** (page.tsx lines 99-184): `borderBottom: 1px solid var(--color-border)`, `padding: 40px 0 32px`, `display: flex`, `gap: 24px`, icon 80x80 `rounded-[18px]`, h1 `fontSize: 2rem`, description `fontSize: 1rem` up to 640px wide.

**Install section** (page.tsx lines 186-218): `marginTop: 32px`, code block 640px wide, `borderRadius: 10px`, `padding: 12px 16px`.

**Stats row** (page.tsx lines 220-351): three stat tiles `minWidth: 110px`, `padding: 16px 20px`, `borderRadius: 10px`.

**Full new file pattern:**
```typescript
export default function CaskLoading() {
  return (
    <main
      className="animate-pulse"
      style={{ maxWidth: '1100px', margin: '0 auto', padding: '0 24px 48px' }}
    >
      {/* Back nav skeleton */}
      <div style={{ paddingTop: '20px' }}>
        <div style={{ height: 30, width: 120, borderRadius: 6, background: 'var(--color-border)' }} />
      </div>

      {/* Hero skeleton */}
      <div style={{ borderBottom: '1px solid var(--color-border)', padding: '40px 0 32px', display: 'flex', alignItems: 'flex-start', gap: '24px' }}>
        {/* Icon skeleton — 80x80 to match Image/InitialsAvatar */}
        <div style={{ width: 80, height: 80, borderRadius: 18, background: 'var(--color-border)', flexShrink: 0 }} />
        {/* Hero body */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1, paddingTop: '4px' }}>
          {/* h1 skeleton */}
          <div style={{ height: 36, width: '40%', borderRadius: 6, background: 'var(--color-border)' }} />
          {/* version/date line */}
          <div style={{ height: 12, width: '30%', borderRadius: 4, background: 'var(--color-border)' }} />
          {/* description lines */}
          <div style={{ height: 16, width: '80%', borderRadius: 4, background: 'var(--color-border)' }} />
          <div style={{ height: 16, width: '65%', borderRadius: 4, background: 'var(--color-border)' }} />
        </div>
      </div>

      {/* Install block skeleton */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ height: 11, width: 60, borderRadius: 4, background: 'var(--color-border)', marginBottom: '10px' }} />
        <div style={{ height: 48, maxWidth: 640, borderRadius: 10, background: 'var(--color-border)' }} />
      </div>

      {/* Stats row skeleton */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '32px' }}>
        {['30d', '90d', '365d'].map((k) => (
          <div key={k} style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 10, padding: '16px 20px', minWidth: 110, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 10, width: 40, borderRadius: 4, background: 'var(--color-border)' }} />
            <div style={{ height: 18, width: 60, borderRadius: 4, background: 'var(--color-border)' }} />
          </div>
        ))}
      </div>
    </main>
  );
}
```

---

## Shared Patterns

### CSS Variable Design Tokens
**Source:** Used consistently across all existing components
**Apply to:** All new components (`search-input.tsx`, `browse/loading.tsx`, `cask/[token]/loading.tsx`)

| Token | Usage |
|---|---|
| `var(--color-bg)` | Page background |
| `var(--color-surface)` | Card / input background |
| `var(--color-border)` | Borders + skeleton fill color |
| `var(--color-text)` | Primary text |
| `var(--color-text-muted)` | Secondary text |
| `var(--color-text-faint)` | Tertiary / metadata text |
| `var(--color-primary-dim)` | Active state background |
| `var(--color-primary)` | Active state border |
| `var(--color-primary-hover)` | Active state text / accent (`#9581ff`) |
| `var(--font-mono)` | Monospace code/token text |

Use `var(--color-border)` as the skeleton fill — it matches the existing surface contrast in dark theme without requiring a separate token.

### Inline Styles (not Tailwind classes) for Layout
**Source:** `src/components/cask-card.tsx`, `src/app/browse/page.tsx`, `src/app/cask/[token]/page.tsx`
**Apply to:** All new files

The project uses inline `style={{}}` objects for all layout and spacing. Tailwind utility classes are used only for responsive grid (`grid grid-cols-1 md:grid-cols-2 gap-3`), hover states, and animation (`animate-pulse`). Do not convert layout to Tailwind — maintain consistency with existing files.

### `Response.json()` Shorthand for API Routes
**Source:** `src/app/api/revalidate/route.ts` (line 9, 13)
**Apply to:** `src/app/api/search/route.ts`

```typescript
return Response.json({ error: "Unauthorized" }, { status: 401 });
return Response.json({ revalidated: true, now: Date.now() });
```

Use `Response.json()` (not `new Response(JSON.stringify(...), { headers: { "Content-Type": ... } })`) for simple responses. The cron/sync route uses the verbose form only because it sets explicit headers for long responses.

### Path Alias `@/`
**Source:** All existing files (queries.ts line 2: `from '@/db'`, cask-card.tsx line 4: `from '@/lib/format'`)
**Apply to:** All new files

All imports use `@/` as the `src/` alias. Never use relative `../` paths except within the same directory.

### `and()` for Multi-condition Drizzle `.where()`
**Source:** `src/lib/queries.ts` line 44 (`getCaskByToken`)
**Apply to:** `searchCasks` in `queries.ts`

```typescript
.where(and(eq(casks.is_active, true), eq(casks.token, token)))
```

Never chain `.where()` calls — each call overwrites the previous. Always compose with `and()`.

---

## No Analog Found

All files have close analogs in the codebase. No files require falling back to RESEARCH.md patterns alone.

---

## Migration Note

**File:** `src/db/migrations/` (new migration SQL file — not in the file list above but required)

The `search_vector` column addition requires a Drizzle migration:
1. Run `drizzle-kit generate` to produce a versioned `.sql` file in `src/db/migrations/`
2. Run `drizzle-kit migrate` (or apply SQL directly via Neon console) during low-traffic window
3. The generated SQL will be:
   ```sql
   ALTER TABLE "casks" ADD COLUMN "search_vector" tsvector
     GENERATED ALWAYS AS (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", ''))) STORED;
   CREATE INDEX "idx_casks_search_vector" ON "casks" USING gin ("search_vector");
   ```
4. Existing rows are populated immediately by Postgres on ALTER — no backfill step needed

---

## Metadata

**Analog search scope:** `src/app/api/`, `src/app/browse/`, `src/app/cask/[token]/`, `src/components/`, `src/lib/`, `src/db/`
**Files scanned:** 10 source files read in full
**Pattern extraction date:** 2026-05-25
