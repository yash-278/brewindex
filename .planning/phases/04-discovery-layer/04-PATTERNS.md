# Phase 4: Discovery Layer - Pattern Map

**Mapped:** 2026-05-26
**Files analyzed:** 9 new/modified files
**Analogs found:** 9 / 9

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/db/schema.ts` | model | schema | (same file — add column) | exact |
| `src/db/migrations/0002_add_category.sql` | migration | DDL | `src/db/migrations/0001_add_search_vector.sql` | exact |
| `src/lib/queries.ts` | service | CRUD | (same file — extend queries) | exact |
| `src/components/category-filter.tsx` | client component | request-response | `src/components/search-input.tsx` | role-match |
| `src/components/sort-dropdown.tsx` | client component | request-response | `src/components/search-input.tsx` | role-match |
| `src/components/github-stats-card.tsx` | server component | display | `src/app/cask/[token]/page.tsx` (stats block) | role-match |
| `src/components/star-badge.tsx` | pure component | display | `src/components/cask-card.tsx` (installs pill) | exact |
| `src/components/cask-card.tsx` | component | display | (same file — add badge) | exact |
| `src/app/browse/page.tsx` | page | request-response | (same file — extend params) | exact |

## Pattern Assignments

### `src/db/schema.ts` (model, schema)

**Analog:** (same file — extend with new column)

**Column definition pattern** (lines 22-24):
```typescript
    install_30d:      integer('install_30d'),
    install_90d:      integer('install_90d'),
    install_365d:     integer('install_365d'),
```

**New column to add** (after line 24, before `github_stars`):
```typescript
    category:         text('category'),
```

**Schema export pattern** (lines 40-41):
```typescript
export type CaskInsertRow = typeof casks.$inferInsert;
export type CaskSelectRow = typeof casks.$inferSelect;
```

**Note:** Column is nullable by default — matches decision D-03 (category populated during pipeline enrichment, initially NULL for uncategorized casks).

---

### `src/db/migrations/0002_add_category.sql` (migration, DDL)

**Analog:** `src/db/migrations/0001_add_search_vector.sql`

**Migration file structure** (lines 1-11):
```sql
-- Migration: Add full-text search vector column and GIN index to casks table
-- Phase 03-01: search-security / tsvector foundation
-- Applied: 2026-05-25
-- Note: casks table was created in Phase 01 (data-pipeline) without migration history.
--       This migration adds the search_vector generated column and GIN index.

ALTER TABLE "casks"
ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", ''))) STORED;

CREATE INDEX "idx_casks_search_vector" ON "casks" USING gin ("search_vector");
```

**Pattern for new migration:**
- Comment block with phase reference, date, and purpose
- `ALTER TABLE "casks" ADD COLUMN "{name}" {type};`
- Optional index creation if filtering performance critical (category filtering = yes)

**Recommended new migration:**
```sql
-- Migration: Add category column for discovery filtering
-- Phase 04: discovery-layer / category filtering
-- Applied: 2026-05-26
-- Note: Category populated during sync pipeline enrichment via AWS Bedrock ML categorization.
--       Nullable during initial rollout; uncategorized casks remain NULL.

ALTER TABLE "casks"
ADD COLUMN "category" text;

CREATE INDEX "idx_casks_category" ON "casks" ("category");
```

---

### `src/lib/queries.ts` (service, CRUD)

**Analog:** (same file — extend with new query function)

**Cached query pattern with filtering** (lines 10-23):
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

**Conditional WHERE clause pattern** (from `searchCasks`, lines 76-80):
```typescript
    .where(
      and(
        eq(casks.is_active, true),
        sql`${casks.search_vector} @@ plainto_tsquery('english', ${q})`
      )
    )
```

**Dynamic ORDER BY pattern** (from `searchCasks`, lines 82-85):
```typescript
    .orderBy(
      sql`ts_rank(${casks.search_vector}, plainto_tsquery('english', ${q})) DESC`,
      desc(casks.install_365d)
    )
```

**Imports needed for new query** (lines 1-4):
```typescript
import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import { casks, type CaskSelectRow } from '@/db/schema';
import { and, desc, eq, sql } from 'drizzle-orm';
```

**Add import for dynamic sorting:**
```typescript
import { and, desc, asc, eq, sql } from 'drizzle-orm'; // add `asc`
```

**Pattern for new query function:**
```typescript
export const getCasksPageFiltered = unstable_cache(
  async (opts: { category?: string; sort: 'popular' | 'alphabetical' | 'updated'; page: number }) => {
    const { category, sort, page } = opts;
    const offset = (page - 1) * PAGE_SIZE;
    
    // Build WHERE conditions array
    const conditions = [eq(casks.is_active, true)];
    if (category) {
      conditions.push(eq(casks.category, category));
    }
    
    // Build dynamic ORDER BY clause
    const orderClause = 
      sort === 'alphabetical' ? asc(casks.name) :
      sort === 'updated' ? desc(casks.last_synced_at) :
      desc(casks.install_365d); // default: 'popular'
    
    return db
      .select()
      .from(casks)
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(PAGE_SIZE)
      .offset(offset);
  },
  ['casks-filtered'],
  { tags: ['casks'] }
);
```

**Count query with category filter:**
```typescript
export const getCasksCountFiltered = unstable_cache(
  async (category?: string) => {
    const conditions = [eq(casks.is_active, true)];
    if (category) {
      conditions.push(eq(casks.category, category));
    }
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(casks)
      .where(and(...conditions));
    return result[0]?.count ?? 0;
  },
  ['casks-count-filtered'],
  { tags: ['casks'] }
);
```

**Get unique categories for filter UI:**
```typescript
export const getCategories = unstable_cache(
  async () => {
    return db
      .selectDistinct({ category: casks.category })
      .from(casks)
      .where(and(eq(casks.is_active, true), sql`${casks.category} IS NOT NULL`))
      .orderBy(asc(casks.category));
  },
  ['categories'],
  { tags: ['casks'] }
);
```

---

### `src/components/category-filter.tsx` (client component, request-response)

**Analog:** `src/components/search-input.tsx`

**Client directive** (line 1):
```typescript
'use client';
```

**URL state management imports** (line 2):
```typescript
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
```

**URLSearchParams pattern** (lines 33-44):
```typescript
      timerRef.current = setTimeout(() => {
        const params = new URLSearchParams(searchParams.toString());
        if (v.trim().length >= SEARCH_MIN_LENGTH) {
          params.set('q', v.trim());
          params.delete('page');
        } else {
          params.delete('q');
          params.delete('page');
        }
        router.replace(
          pathname + (params.toString() ? '?' + params.toString() : ''),
          { scroll: false }
        );
      }, DEBOUNCE_MS);
```

**Pattern for category filter (no debounce, immediate navigation):**
```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

export function CategoryFilter({ 
  currentCategory,
  categories 
}: { 
  currentCategory?: string;
  categories: { category: string | null }[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  function setCategory(cat: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (cat) {
      params.set('category', cat);
    } else {
      params.delete('category');
    }
    params.delete('page'); // Reset to page 1 when filtering
    router.replace(
      pathname + (params.toString() ? '?' + params.toString() : ''),
      { scroll: false }
    );
  }
  
  const isActive = (cat: string | null) => 
    cat === null ? !currentCategory : currentCategory === cat;
  
  const pillBase: React.CSSProperties = {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '9999px',
    padding: '6px 16px',
    fontSize: '0.9375rem',
    fontWeight: 500,
    color: 'var(--color-text-muted)',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  };
  
  const pillActive: React.CSSProperties = {
    ...pillBase,
    background: 'var(--color-primary-dim)',
    borderColor: 'var(--color-primary)',
    color: 'var(--color-primary-hover)',
  };
  
  return (
    <div 
      role="group" 
      aria-label="Category filter"
      style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
    >
      <button
        onClick={() => setCategory(null)}
        style={isActive(null) ? pillActive : pillBase}
        aria-pressed={isActive(null)}
      >
        All Apps
      </button>
      {categories.map((c) => (
        <button
          key={c.category}
          onClick={() => setCategory(c.category)}
          style={isActive(c.category) ? pillActive : pillBase}
          aria-pressed={isActive(c.category)}
        >
          {c.category}
        </button>
      ))}
    </div>
  );
}
```

---

### `src/components/sort-dropdown.tsx` (client component, request-response)

**Analog:** `src/components/search-input.tsx` (URL state pattern)

**Client directive + imports** (lines 1-4):
```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
```

**URL update pattern** (lines 41-44):
```typescript
        router.replace(
          pathname + (params.toString() ? '?' + params.toString() : ''),
          { scroll: false }
        );
```

**Pattern for sort dropdown (using native select):**
```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const SORT_OPTIONS = {
  popular: 'Popular',
  alphabetical: 'A-Z',
  updated: 'Recently Updated',
} as const;

export function SortDropdown({ currentSort }: { currentSort: string }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  
  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', e.target.value);
    params.delete('page'); // Reset to page 1 when sorting changes
    router.replace(
      pathname + (params.toString() ? '?' + params.toString() : ''),
      { scroll: false }
    );
  }
  
  return (
    <select
      value={currentSort}
      onChange={handleChange}
      style={{
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: '10px',
        padding: '6px 12px',
        fontSize: '0.9375rem',
        fontWeight: 500,
        color: 'var(--color-text)',
        cursor: 'pointer',
        outline: 'none',
      }}
      aria-label="Sort casks by"
    >
      {Object.entries(SORT_OPTIONS).map(([key, label]) => (
        <option key={key} value={key}>
          {label}
        </option>
      ))}
    </select>
  );
}
```

---

### `src/components/github-stats-card.tsx` (server component, display)

**Analog:** `src/app/cask/[token]/page.tsx` (stats block lines 220-350)

**Section heading pattern** (lines 232-240):
```typescript
          <p
            style={{
              fontSize: '0.6875rem',
              fontWeight: 400,
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              color: 'var(--color-text-faint)',
              marginBottom: '10px',
            }}
          >
            INSTALL STATS
          </p>
```

**Stat card pattern** (lines 245-278):
```typescript
            <div
              style={{
                background: 'var(--color-surface)',
                border: '1px solid var(--color-border)',
                borderRadius: '10px',
                padding: '16px 20px',
                minWidth: '110px',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <span
                style={{
                  fontSize: '0.6875rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: 'var(--color-text-faint)',
                }}
              >
                30 days
              </span>
              <span
                style={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: '#9581ff',
                }}
              >
                {formatInstallCount(c.install_30d)}
              </span>
            </div>
```

**Format utility import** (line 7):
```typescript
import { formatInstallCount } from '@/lib/format';
```

**Pattern for GitHub stats card (horizontal layout with separators):**
```typescript
import type { CaskSelectRow } from '@/db/schema';
import { formatInstallCount } from '@/lib/format';
import { Star, GitFork, AlertCircle } from 'lucide-react';

export function GitHubStatsCard({ cask }: { cask: CaskSelectRow }) {
  // Only render if GitHub enrichment succeeded
  if (!cask.github_enriched || cask.github_stars === null) {
    return null;
  }
  
  return (
    <section style={{ marginTop: '32px' }}>
      <p
        style={{
          fontSize: '0.6875rem',
          fontWeight: 400,
          textTransform: 'uppercase',
          letterSpacing: '0.07em',
          color: 'var(--color-text-faint)',
          marginBottom: '10px',
        }}
      >
        REPOSITORY STATS
      </p>
      
      <div
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: '10px',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        {/* Stars */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Star size={20} style={{ color: '#9581ff' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_stars)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              stars
            </span>
          </div>
        </div>
        
        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            background: 'var(--color-border-subtle)',
          }}
        />
        
        {/* Forks */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitFork size={16} style={{ color: 'var(--color-text-muted)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_forks)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              forks
            </span>
          </div>
        </div>
        
        {/* Separator */}
        <div
          style={{
            width: '1px',
            height: '32px',
            background: 'var(--color-border-subtle)',
          }}
        />
        
        {/* Open Issues */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={16} style={{ color: 'var(--color-text-muted)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span
              style={{
                fontSize: '1rem',
                fontWeight: 700,
                letterSpacing: '-0.02em',
                color: 'var(--color-text)',
              }}
            >
              {formatInstallCount(cask.github_issues)}
            </span>
            <span
              style={{
                fontSize: '0.6875rem',
                color: 'var(--color-text-faint)',
              }}
            >
              open issues
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
```

---

### `src/components/star-badge.tsx` (pure component, display)

**Analog:** `src/components/cask-card.tsx` (installs pill lines 98-110)

**Pill badge pattern** (lines 98-110):
```typescript
          <span
            style={{
              background: 'rgba(124,106,255,0.15)',
              border: '1px solid rgba(124,106,255,0.25)',
              color: '#9581ff',
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '0.6875rem',
              whiteSpace: 'nowrap',
            }}
          >
            ↓ {formatInstallCount(cask.install_365d)} / yr
          </span>
```

**Format utility import** (line 4):
```typescript
import { formatInstallCount } from '@/lib/format';
```

**Pattern for star badge:**
```typescript
import { formatInstallCount } from '@/lib/format';

export function StarBadge({ count }: { count: number }) {
  return (
    <span
      style={{
        background: 'rgba(124,106,255,0.15)',
        border: '1px solid rgba(124,106,255,0.25)',
        color: '#9581ff',
        borderRadius: '9999px',
        padding: '2px 8px',
        fontSize: '0.6875rem',
        whiteSpace: 'nowrap',
      }}
    >
      ★ {formatInstallCount(count)}
    </span>
  );
}
```

---

### `src/components/cask-card.tsx` (component, display)

**Analog:** (same file — add star badge to metadata strip)

**Metadata strip structure** (lines 88-141):
```typescript
        {/* Metadata strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            marginTop: '4px',
          }}
        >
          {/* Installs pill */}
          <span
            style={{
              background: 'rgba(124,106,255,0.15)',
              border: '1px solid rgba(124,106,255,0.25)',
              color: '#9581ff',
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '0.6875rem',
              whiteSpace: 'nowrap',
            }}
          >
            ↓ {formatInstallCount(cask.install_365d)} / yr
          </span>

          {/* Platform pill */}
          <span
            style={{
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              borderRadius: '9999px',
              padding: '2px 8px',
              fontSize: '0.6875rem',
            }}
          >
            macOS
          </span>

          {/* Token */}
          <span
            style={{
              marginLeft: 'auto',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.6875rem',
              color: 'var(--color-text-faint)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '120px',
            }}
          >
            {cask.token}
          </span>
        </div>
```

**Conditional rendering pattern** (TypeScript guard):
```typescript
{cask.github_enriched && cask.github_stars !== null && (
  <StarBadge count={cask.github_stars} />
)}
```

**Add import at top:**
```typescript
import { StarBadge } from '@/components/star-badge';
```

**Insert star badge after installs pill (after line 110, before platform pill):**
```typescript
          {/* GitHub stars badge */}
          {cask.github_enriched && cask.github_stars !== null && (
            <StarBadge count={cask.github_stars} />
          )}
```

---

### `src/app/browse/page.tsx` (page, request-response)

**Analog:** (same file — extend searchParams handling)

**searchParams Promise pattern** (lines 10-15):
```typescript
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q } = await searchParams;
```

**Search mode branch** (lines 17-30):
```typescript
  // Search mode — branch taken when ?q is present and meets min length
  if (q && q.trim().length >= SEARCH_MIN_LENGTH) {
    const trimmed = q.trim().slice(0, SEARCH_MAX_LENGTH);
    const results = await searchCasks(trimmed);
    return (
      <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
          {results.length} result{results.length !== 1 ? 's' : ''} for &ldquo;{trimmed}&rdquo;
        </p>
        <CaskGrid casks={results} />
        {/* No <Pagination> in search mode — D-03 */}
      </main>
    );
  }
```

**Normal browse with pagination** (lines 33-48):
```typescript
  // Normal paginated browse continues below
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
```

**Pattern for extended browse page:**

1. **Update searchParams type** (line 13):
```typescript
  searchParams: Promise<{ page?: string; q?: string; category?: string; sort?: string }>;
```

2. **Destructure new params** (line 15):
```typescript
  const { page: pageParam, q, category, sort } = await searchParams;
```

3. **Add imports:**
```typescript
import { getCasksPageFiltered, getCasksCountFiltered, getCategories } from '@/lib/queries';
import { CategoryFilter } from '@/components/category-filter';
import { SortDropdown } from '@/components/sort-dropdown';
```

4. **Replace getCasksPage/getCasksCount calls** (line 35):
```typescript
  const sortKey = (sort === 'alphabetical' || sort === 'updated') ? sort : 'popular';
  
  const [pageCasks, totalCount, categories] = await Promise.all([
    getCasksPageFiltered({ category, sort: sortKey, page }),
    getCasksCountFiltered(category),
    getCategories(),
  ]);
```

5. **Add filter/sort controls before CaskGrid** (line 44):
```typescript
  return (
    <main style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 24px 32px' }}>
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap', alignItems: 'center' }}>
        <CategoryFilter currentCategory={category} categories={categories} />
        <SortDropdown currentSort={sortKey} />
      </div>
      <CaskGrid casks={pageCasks} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </main>
  );
```

---

## Shared Patterns

### Format Utility
**Source:** `src/lib/format.ts`
**Apply to:** `github-stats-card.tsx`, `star-badge.tsx` (already used in `cask-card.tsx`)

```typescript
export function formatInstallCount(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.floor(value / 1_000)}K`;
  return String(value);
}
```

**Usage:** Format GitHub star/fork counts with same pattern as install counts (12345 → "12.3k").

### URL State Management (Client Components)
**Source:** `src/components/search-input.tsx`
**Apply to:** `category-filter.tsx`, `sort-dropdown.tsx`

**Core pattern:**
```typescript
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

const searchParams = useSearchParams();
const router = useRouter();
const pathname = usePathname();

function updateParam(key: string, value: string | null) {
  const params = new URLSearchParams(searchParams.toString());
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
  params.delete('page'); // Always reset to page 1 when filters change
  router.replace(
    pathname + (params.toString() ? '?' + params.toString() : ''),
    { scroll: false }
  );
}
```

### Conditional Rendering (GitHub Data)
**Source:** `src/app/cask/[token]/page.tsx` (implicit pattern)
**Apply to:** `github-stats-card.tsx`, `star-badge.tsx` in `cask-card.tsx`

**Pattern:**
```typescript
{cask.github_enriched && cask.github_stars !== null && (
  <Component />
)}
```

**Rationale:** Phase 1 added `github_enriched` boolean flag. Check this flag explicitly to avoid showing "0 stars" for casks without GitHub repos (per D-12).

### Pill Badge Styling
**Source:** `src/components/cask-card.tsx` (installs pill lines 98-110)
**Apply to:** `star-badge.tsx`

```typescript
style={{
  background: 'rgba(124,106,255,0.15)',
  border: '1px solid rgba(124,106,255,0.25)',
  color: '#9581ff',
  borderRadius: '9999px',
  padding: '2px 8px',
  fontSize: '0.6875rem',
  whiteSpace: 'nowrap',
}}
```

**Consistency:** All accent badges (installs, stars) use primary color with 0.15 alpha background, 0.25 alpha border.

### Responsive Grid Layout
**Source:** `src/components/cask-grid.tsx` (line 31)
**Apply to:** (extend breakpoints for 3/4-column layout)

**Current:**
```typescript
<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
```

**Extended for Phase 4 (per D-15):**
```typescript
<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
```

**Breakpoint mapping:**
- `grid-cols-1` → < 640px (mobile)
- `sm:grid-cols-2` → ≥ 640px (tablet)
- `lg:grid-cols-3` → ≥ 1024px (desktop)
- `xl:grid-cols-4` → ≥ 1440px (wide)

### Section Heading Uppercase Style
**Source:** `src/app/cask/[token]/page.tsx` (lines 188-199, 232-240)
**Apply to:** `github-stats-card.tsx` section heading

```typescript
style={{
  fontSize: '0.6875rem',
  fontWeight: 400,
  textTransform: 'uppercase',
  letterSpacing: '0.07em',
  color: 'var(--color-text-faint)',
  marginBottom: '10px',
}}
```

### ISR Cache Tags
**Source:** `src/lib/queries.ts` (all query functions)
**Apply to:** All new query functions (`getCasksPageFiltered`, `getCasksCountFiltered`, `getCategories`)

**Pattern:**
```typescript
export const getCategories = unstable_cache(
  async () => { /* ... */ },
  ['categories'],
  { tags: ['casks'] } // ← All cask queries must use 'casks' tag for revalidation
);
```

**Rationale:** Phase 1 established `revalidateTag('casks')` pattern. All browse/filter queries must share this tag for ISR invalidation.

---

## No Analog Found

All files have close analogs in the existing codebase. No external research patterns required.

---

## Metadata

**Analog search scope:** 
- `src/db/` (schema, migrations)
- `src/lib/` (queries, utilities)
- `src/components/` (UI components)
- `src/app/browse/` (browse page)
- `src/app/cask/[token]/` (detail page)

**Files scanned:** 20
**Pattern extraction date:** 2026-05-26

**Key observations:**
1. **URL state management:** Existing pattern from `search-input.tsx` (Phase 3) applies directly to category/sort controls
2. **Conditional filtering:** Drizzle `and()` with conditional array building pattern matches requirement perfectly
3. **Dynamic sorting:** Add `asc` import, use ternary for ORDER BY clause selection
4. **Pill badges:** Existing install count pill provides exact styling pattern for star badge
5. **Migration structure:** Phase 3 migration provides template for adding category column
6. **Stats card:** Detail page install stats block provides layout pattern for GitHub stats
7. **Client component patterns:** Search input provides complete URL state management pattern
8. **Format utility:** Existing `formatInstallCount` works for GitHub metrics with no changes needed

**Integration points confirmed:**
- Schema extension (add column)
- Query extension (add functions with same ISR cache pattern)
- Component reuse (StarBadge follows pill pattern exactly)
- Page extension (browse page reads new params, calls new queries)
- Loading state (existing skeleton pattern works for filter/sort transitions)
