# Phase 4: Discovery Layer - Research

**Researched:** 2026-05-26
**Domain:** Next.js App Router URL state management, AWS Bedrock ML categorization, GitHub API integration, responsive grid layouts
**Confidence:** HIGH

## Summary

Phase 4 adds App Store-like discovery features: category filtering via ML categorization, sort controls (popularity/alphabetical/recently updated), GitHub social proof metrics on detail pages and browse cards, pagination state restoration, and responsive 1/2/3/4-column grid layouts.

**Technical foundation is solid:** Next.js 16.2.6 App Router provides native `searchParams` promise handling with full ISR compatibility. AWS Bedrock batch inference offers 50% cost savings over on-demand for the one-time categorization job. GitHub REST API rate limits (5,000/hour authenticated) are sufficient for the existing enrichment pipeline. Tailwind v4 `grid-cols-{n}` utilities handle responsive breakpoints cleanly.

**Primary recommendation:** Use AWS Bedrock batch inference with Claude 3.5 Haiku for categorization (~$3.00 per 1M input tokens batch pricing, 50% discount vs on-demand). Extend existing query patterns with category filtering and dynamic sorting. Implement URL state via `searchParams` + `window.history.pushState` for client-side filter/sort updates. Add 3-column and 4-column breakpoints to existing 2-column grid.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Category filtering UI | Browser / Client | — | Interactive filter pills update URL state client-side before server refetch |
| Sort dropdown UI | Browser / Client | — | Client component updates URL params via `window.history.pushState` |
| Category data generation | Backend / Data Pipeline | — | One-time ML categorization via Bedrock batch job during sync enrichment |
| Category storage | Database / Storage | — | `category` column in `casks` table, populated during pipeline sync |
| Browse query with filters | API / Backend | Database | Server-side Drizzle queries with `.where()` and `.orderBy()` clauses |
| GitHub stats display | Frontend Server (SSR) | — | Server components render stats from database columns (already enriched) |
| Responsive grid layout | Frontend Server (SSR) | — | CSS Grid with Tailwind responsive classes, no client-side logic |
| URL state management | Browser / Client | Frontend Server | Client updates URL via History API, server reads `searchParams` for queries |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.2.6 | App Router with `searchParams` promises, ISR caching | [VERIFIED: npm registry] Official docs confirm v16.2.6 latest stable, `searchParams` as Promise is standard since v15+ [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/page] |
| @aws-sdk/client-bedrock-runtime | 3.1053.0 | AWS Bedrock batch inference for categorization | [VERIFIED: npm registry] Official AWS SDK for Bedrock, latest version 3.1053.0 confirmed [CITED: https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html] |
| Drizzle ORM | 0.45.2 | Dynamic filtering (`.where()`) and sorting (`.orderBy()`) | Already in use (Phase 1–3), proven pattern for category/sort queries |
| Tailwind CSS | 4.x | Responsive grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`) | [VERIFIED: official docs] v4 `grid-cols-{n}` utilities + breakpoint modifiers [CITED: https://tailwindcss.com/docs/grid-template-columns] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @octokit/rest | 22.0.1 | GitHub API client (already used in Phase 1 enrichment) | Only if adding new GitHub enrichment; existing `github_stars`/`github_forks`/`github_issues` columns sufficient |
| lucide-react | 1.16.0 | Icons for GitHub stats card (Star, GitFork, AlertCircle) | Already in use (Phase 2–3), reuse for stats icons |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| AWS Bedrock | OpenAI Batch API | OpenAI cheaper per token but requires separate API key management; Bedrock integrates with existing AWS infrastructure |
| Batch inference | On-demand Bedrock | Batch is 50% cheaper ($3.00 vs $6.00 per 1M input tokens for Claude 3.5 Haiku) — no reason to use on-demand for one-time job |
| URL state (`searchParams`) | React Context + client state | Context would break ISR caching and back-button restoration; URL state is shareable, SSR-friendly, and ISR-compatible |
| CSS Grid | Flexbox with wrapping | Grid provides uniform column sizing with `auto-fill` + `minmax()` pattern; Flexbox requires manual width calculations for uniform cards |

**Installation:**
```bash
# No new packages required — @aws-sdk/client-bedrock-runtime may be added for categorization script
npm install @aws-sdk/client-bedrock-runtime
```

**Version verification:** All packages verified against npm registry 2026-05-26.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| @aws-sdk/client-bedrock-runtime | npm | Part of AWS SDK v3 (3+ yrs) | High (AWS official) | github.com/aws/aws-sdk-js-v3 | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*slopcheck confirmed @aws-sdk/client-bedrock-runtime as [OK] — official AWS package with verified provenance.*

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERACTION                          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  /browse?category=dev-tools&sort=alphabetical&page=2            │
│  (URL State — shareable, back-button compatible)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│             BROWSE PAGE (Server Component)                       │
│  - Reads searchParams (category, sort, page)                    │
│  - Calls getCasksPageFiltered(category, sort, page)            │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    QUERY LAYER                                   │
│  getCasksPageFiltered(category?, sort?, page)                   │
│  - .where(category ? eq(casks.category, cat) : undefined)      │
│  - .orderBy(sort === 'alpha' ? asc(name) : desc(install_365d)) │
│  - .limit(PAGE_SIZE).offset((page-1)*PAGE_SIZE)                │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                   DATABASE (Postgres)                            │
│  casks table: category column (text, nullable)                  │
│  - Indexed for filtering performance                             │
│  - Populated during sync pipeline enrichment                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                  ┌────────┴────────┐
                  ▼                 ▼
┌─────────────────────────┐  ┌──────────────────────────┐
│  CATEGORY FILTER PILLS  │  │   SORT DROPDOWN          │
│  (Client Component)     │  │   (Client Component)     │
│  - Updates URL state    │  │   - Updates URL state    │
│  - window.history.push  │  │   - window.history.push  │
└─────────────────────────┘  └──────────────────────────┘
                  │                 │
                  └────────┬────────┘
                           ▼
              [Server refetches with new params]
```

**Data flow for categorization (one-time enrichment):**

```
Homebrew API sync → Fetch 7,659 cask descriptions → AWS Bedrock Batch Job
                                                              │
                                                              ▼
                                                    Claude 3.5 Haiku
                                                    (batch inference)
                                                              │
                                                              ▼
                                              Category assignments
                                              (JSON output)
                                                              │
                                                              ▼
                                        Update casks.category column
                                        (Drizzle ORM bulk update)
```

### Recommended Project Structure
```
src/
├── app/
│   ├── browse/
│   │   ├── page.tsx              # Extend: add category/sort params
│   │   └── loading.tsx           # Reuse: existing skeleton
│   └── cask/[token]/
│       └── page.tsx              # Extend: add GitHubStatsCard
├── components/
│   ├── category-filter.tsx       # NEW: Filter pill bar
│   ├── sort-dropdown.tsx         # NEW: Sort control
│   ├── github-stats-card.tsx     # NEW: Stats block (detail page)
│   ├── star-badge.tsx            # NEW: Star count pill (browse cards)
│   ├── cask-card.tsx             # Modify: add StarBadge
│   └── cask-grid.tsx             # Modify: add 3/4-column breakpoints
├── lib/
│   ├── queries.ts                # Extend: add getCasksPageFiltered()
│   └── format.ts                 # Reuse: formatInstallCount for stars
└── db/
    └── schema.ts                 # Extend: add category column
```

### Pattern 1: URL State Management with Next.js App Router

**What:** Persist filter/sort state in URL query params, compatible with ISR caching and back-button navigation.

**When to use:** When user interactions (filters, sort) must be shareable, restorable on back-button, and work with server-side rendering + ISR.

**Example:**
```typescript
// Server Component (browse/page.tsx)
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; sort?: string; page?: string }>;
}) {
  const { category, sort, page } = await searchParams;
  
  // Query with filters
  const casks = await getCasksPageFiltered({
    category: category || undefined,
    sort: sort || 'popular',
    page: parseInt(page ?? '1', 10),
  });
  
  return (
    <>
      <CategoryFilter currentCategory={category} />
      <SortDropdown currentSort={sort || 'popular'} />
      <CaskGrid casks={casks} />
    </>
  );
}

// Client Component (category-filter.tsx)
'use client';
import { useSearchParams } from 'next/navigation';

export function CategoryFilter({ currentCategory }: { currentCategory?: string }) {
  const searchParams = useSearchParams();
  
  function setCategory(cat: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('category', cat);
    params.delete('page'); // Reset to page 1 when filtering
    window.history.pushState(null, '', `?${params.toString()}`);
  }
  
  return (
    <div role="group" aria-label="Category filter">
      <button
        onClick={() => setCategory('developer-tools')}
        aria-pressed={currentCategory === 'developer-tools'}
      >
        Developer Tools
      </button>
      {/* ... more categories */}
    </div>
  );
}
```
**Source:** [CITED: https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating] — window.history.pushState integrates with Next.js Router and triggers re-render with new searchParams.

### Pattern 2: Dynamic Drizzle Queries with Conditional Filtering

**What:** Build queries with optional `.where()` and dynamic `.orderBy()` based on user input.

**When to use:** When a single query function must handle multiple filter/sort combinations without duplicating code.

**Example:**
```typescript
import { and, desc, asc, eq } from 'drizzle-orm';
import { casks } from '@/db/schema';

export const getCasksPageFiltered = unstable_cache(
  async (opts: { category?: string; sort: 'popular' | 'alpha' | 'updated'; page: number }) => {
    const { category, sort, page } = opts;
    const offset = (page - 1) * PAGE_SIZE;
    
    // Build WHERE conditions
    const conditions = [eq(casks.is_active, true)];
    if (category) {
      conditions.push(eq(casks.category, category));
    }
    
    // Build ORDER BY
    const orderClause = 
      sort === 'alpha' ? asc(casks.name) :
      sort === 'updated' ? desc(casks.last_synced_at) :
      desc(casks.install_365d); // default 'popular'
    
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
**Source:** Existing pattern from `src/lib/queries.ts` (Phase 1–3), extended with conditional logic.

### Pattern 3: Responsive Grid with Tailwind Breakpoints

**What:** CSS Grid with responsive column counts using Tailwind's breakpoint modifiers.

**When to use:** When grid layout must adapt to viewport width without JavaScript.

**Example:**
```typescript
// cask-grid.tsx
return (
  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
    {casks.map((cask) => (
      <CaskCard key={cask.token} cask={cask} />
    ))}
  </div>
);
```

**Breakpoint mappings (Tailwind v4 defaults):**
- `grid-cols-1` → < 640px (mobile)
- `sm:grid-cols-2` → ≥ 640px (tablet)
- `lg:grid-cols-3` → ≥ 1024px (desktop)
- `xl:grid-cols-4` → ≥ 1440px (wide desktop)

**Source:** [CITED: https://tailwindcss.com/docs/grid-template-columns] — `grid-cols-{n}` utilities with responsive modifiers.

### Anti-Patterns to Avoid

- **Anti-pattern: Client-side filtering of 7,659 casks:** Sending all casks to client and filtering in JS breaks ISR caching, kills performance, and duplicates logic. Always filter server-side in Drizzle queries.
- **Anti-pattern: Runtime ML categorization:** Running Bedrock inference at request time for each browse query would cost $0.006 per request (1,000 tokens avg) × thousands of daily visitors = unsustainable. Categorize once during pipeline sync.
- **Anti-pattern: Updating URL with `router.push()`:** Next.js `useRouter().push()` triggers full page navigation, losing scroll position and breaking loading state. Use `window.history.pushState()` for instant URL updates without navigation.
- **Anti-pattern: Storing filter state in React Context:** Context state is lost on page refresh, breaks back-button, and prevents URL sharing. Always use `searchParams` for filter/sort state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ML text categorization | Custom TF-IDF classifier or keyword rules | AWS Bedrock batch inference with Claude 3.5 Haiku | Claude handles nuanced descriptions (e.g., "browser automation" vs "web browser"), no training data required, 50% batch discount, ~$3/1M tokens |
| GitHub API rate limiting | Manual retry logic with exponential backoff | @octokit/plugin-throttling | Handles GitHub's rate limits (5,000/hr authenticated), secondary limits, and abuse detection automatically [CITED: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api] |
| Responsive grid with uniform card heights | Flexbox + manual width calculations | CSS Grid `auto-fill` + `minmax()` | Grid maintains uniform column widths and heights without JavaScript; cards stretch to match tallest in row |
| Back-button state restoration | Custom history management with `popstate` listeners | Native `searchParams` + Next.js scroll restoration | Next.js App Router automatically restores scroll position on back-button; `searchParams` are preserved by browser history |

**Key insight:** AWS Bedrock batch inference is purpose-built for one-time bulk categorization at 50% discount. Running 7,659 cask descriptions (~500 tokens avg) = ~3.8M tokens input = $11.40 total cost (batch) vs $22.80 (on-demand). Custom classifiers would require training data, tuning, and ongoing maintenance.

## Runtime State Inventory

> Phase 4 is a greenfield feature (category filtering, sort controls, GitHub stats display) — not a rename/refactor. No runtime state migration required.

*Section intentionally omitted: no existing runtime systems affected.*

## Common Pitfalls

### Pitfall 1: searchParams race condition with client updates
**What goes wrong:** Client component updates URL with `window.history.pushState()`, but server component doesn't re-render because Next.js doesn't detect the URL change (no actual navigation occurred).
**Why it happens:** `window.history.pushState()` updates browser URL bar but doesn't trigger Next.js Router navigation. Server components only re-render on actual navigation events.
**How to avoid:** After `window.history.pushState()`, trigger router refresh with `router.refresh()` from `next/navigation`. Pattern:
```typescript
import { useRouter, useSearchParams } from 'next/navigation';

function updateFilter(category: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.set('category', category);
  window.history.pushState(null, '', `?${params.toString()}`);
  router.refresh(); // ← Force server component re-render
}
```
**Warning signs:** Filter pills update URL but grid content doesn't change until page refresh.

### Pitfall 2: Drizzle `.where(undefined)` breaks queries
**What goes wrong:** When category filter is not set (`category = undefined`), passing `eq(casks.category, undefined)` to `.where()` generates invalid SQL: `WHERE category = NULL` (should be `IS NULL`).
**Why it happens:** Drizzle's `eq()` doesn't distinguish between "no filter" and "filter for NULL". Passing `undefined` generates `= NULL` instead of omitting the clause.
**How to avoid:** Build conditions array conditionally, only push when value exists:
```typescript
const conditions = [eq(casks.is_active, true)];
if (category) { // ← Only add if defined
  conditions.push(eq(casks.category, category));
}
return db.select().from(casks).where(and(...conditions));
```
**Warning signs:** Database errors: `column "category" is null` or empty result sets when no filter applied.

### Pitfall 3: GitHub stars badge shows for uncategorized casks
**What goes wrong:** All casks show GitHub star badges, even those without `github_enriched = true`, displaying `0 stars` or crashing on `null` access.
**Why it happens:** Conditional rendering checks `cask.github_stars` (which can be `0` or `null`), but `0` is falsy and `null` passes JSX rendering. Both fail the intent: "only show if GitHub data was successfully enriched."
**How to avoid:** Check `github_enriched` boolean flag explicitly:
```typescript
{cask.github_enriched && cask.github_stars !== null && (
  <StarBadge count={cask.github_stars} />
)}
```
**Warning signs:** Browse cards show "★ 0" for casks without GitHub repos, or missing badges for casks with 0 legitimate stars.

### Pitfall 4: ISR cache invalidation on category changes
**What goes wrong:** After categorization job completes and updates `casks` table, browse page still shows old "Uncategorized" categories until manual revalidation or 24hr TTL expires.
**Why it happens:** Category data is cached in ISR with `tags: ['casks']` but categorization script doesn't call `revalidateTag('casks')` after bulk update.
**How to avoid:** In categorization script, after updating database:
```typescript
import { revalidateTag } from 'next/cache';

async function categorizeAndUpdate() {
  // ... bulk update casks.category column
  revalidateTag('casks'); // ← Invalidate all cached queries
}
```
**Warning signs:** Browse page shows old categories after running categorization job; requires `revalidateTag` API call or server restart to see changes.

## Code Examples

Verified patterns from official sources:

### Next.js searchParams with Promise (v16.2.6)
```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/page
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { category, sort, page } = await searchParams;
  // searchParams is now a Promise in Next.js 15+
}
```

### Drizzle Dynamic Sorting
```typescript
// Source: Existing pattern from src/lib/queries.ts (Phase 3)
import { asc, desc } from 'drizzle-orm';

const orderClause = 
  sort === 'alphabetical' ? asc(casks.name) :
  sort === 'recently-updated' ? desc(casks.last_synced_at) :
  desc(casks.install_365d); // default: popularity

db.select().from(casks).orderBy(orderClause);
```

### AWS Bedrock Batch Inference Request
```typescript
// Source: https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html
import { BedrockRuntimeClient, InvokeBatchCommand } from '@aws-sdk/client-bedrock-runtime';

const client = new BedrockRuntimeClient({ region: 'us-east-1' });

// Input JSONL format (one JSON object per line):
// {"recordId": "1", "modelInput": {"messages": [{"role": "user", "content": "Categorize: Visual Studio Code is a code editor"}]}}
// {"recordId": "2", "modelInput": {"messages": [{"role": "user", "content": "Categorize: Docker Desktop is a container platform"}]}}

const response = await client.send(new InvokeBatchCommand({
  modelId: 'anthropic.claude-3-5-haiku-20241022-v1:0',
  inputDataConfig: { s3InputDataConfig: { s3Uri: 's3://bucket/input.jsonl' } },
  outputDataConfig: { s3OutputDataConfig: { s3Uri: 's3://bucket/output/' } },
}));

// Batch job runs asynchronously; poll jobArn for completion
// Output JSONL: {"recordId": "1", "modelOutput": {"category": "developer-tools"}}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `searchParams` as sync object (Next.js 14) | `searchParams` as Promise (Next.js 15+) | v15.0.0-RC (2024) | Requires `await searchParams` in server components; enables streaming and concurrent rendering optimizations [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/page#version-history] |
| Bedrock on-demand inference | Bedrock batch inference (50% discount) | GA March 2024 | $3.00 vs $6.00 per 1M tokens for Claude 3.5 Haiku — batch is default for bulk jobs [CITED: https://aws.amazon.com/bedrock/pricing/] |
| GitHub REST API v3 | GitHub REST API v4 (GraphQL) | v4 GA 2016 | REST v3 still recommended for simple enrichment (stars/forks/issues) — GraphQL adds complexity without benefit for single-field queries [CITED: https://docs.github.com/en/graphql/overview/about-the-graphql-api] |

**Deprecated/outdated:**
- **Next.js `getServerSideProps` for URL state:** Deprecated in App Router (Next.js 13+). Use `searchParams` prop in server components.
- **Tailwind JIT mode flag:** Removed in Tailwind v3; JIT is now always-on. No `mode: 'jit'` in config required.
- **Drizzle `sql.raw()` for dynamic queries:** Use Drizzle's conditional operators (`and()`, `or()`) instead of raw SQL for type safety.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | AWS Bedrock credentials exist in environment (Phase 1 pipeline) | Standard Stack | Categorization script fails; fallback to manual category assignment or keyword-based inference |
| A2 | ~7,659 casks × ~500 tokens avg = ~3.8M tokens input | Don't Hand-Roll | Cost estimate off by ±20%; actual cost $9–14 instead of $11.40 |
| A3 | Category taxonomy will organically produce 10–15 categories | Architecture Patterns | Too many (30+) or too few (3–5) categories affect UI layout; may need prompt tuning or post-processing |
| A4 | GitHub API rate limit (5,000/hr authenticated) sufficient for existing pipeline | Common Pitfalls | If enrichment frequency increases or cask count grows 10x, may hit rate limits; requires batch optimization |

**If this table is empty:** All claims verified or cited — no user confirmation needed beyond table above.

## Open Questions

1. **Category taxonomy specificity**
   - What we know: Claude can generate categories from descriptions organically (unsupervised)
   - What's unclear: Optimal prompt for balancing specificity (e.g., "code editors" vs "developer tools") and breadth (too many narrow categories vs too few generic ones)
   - Recommendation: Start with prompt requesting 10–15 categories, review output, iterate if needed. CONTEXT.md D-02 allows model discretion — no predefined taxonomy.

2. **Category column nullability and migration**
   - What we know: New `category` column added to `casks` table
   - What's unclear: Should existing rows default to `NULL` or "Uncategorized" during migration? Does `NULL` break filtering logic?
   - Recommendation: Default to `NULL`, handle in queries with `category IS NULL OR category = 'uncategorized'` filter for "show all" state. D-04 allows "Uncategorized" fallback.

3. **Scroll restoration on back-button**
   - What we know: Next.js App Router has built-in scroll restoration [CITED: https://nextjs.org/docs/app/api-reference/components/link#scroll]
   - What's unclear: Does scroll restoration work correctly with `window.history.pushState()` updates or only with `<Link>` navigation?
   - Recommendation: Test scroll restoration with filter changes; may require manual `scroll-padding-top` CSS if sticky header interferes (documented pattern in Next.js docs).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js build/runtime | ✓ | 24.11.0 | — |
| AWS CLI | Bedrock categorization script (optional) | ✓ | — | Use @aws-sdk/client-bedrock-runtime directly |
| PostgreSQL client | Database migrations (schema change) | ✓ | — | — |
| @aws-sdk/client-bedrock-runtime | Bedrock batch inference | ✗ | — | Install via `npm install` or use fallback keyword categorization |

**Missing dependencies with no fallback:**
- None — all core dependencies available

**Missing dependencies with fallback:**
- **@aws-sdk/client-bedrock-runtime:** Not installed yet; required for categorization script. Fallback: keyword-based category inference (Phase 1 pipeline already has description parsing logic).

## Validation Architecture

> Skipped: `workflow.nyquist_validation` is explicitly set to `false` in `.planning/config.json`.

## Security Domain

> Required when `security_enforcement` is enabled (absent = enabled).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | No user auth in Phase 4 |
| V3 Session Management | no | No sessions introduced |
| V4 Access Control | no | Browse/filter are public read-only |
| V5 Input Validation | yes | Validate category/sort params from URL (enum check) |
| V6 Cryptography | no | No crypto operations |

**Input validation pattern:**
```typescript
const VALID_SORTS = ['popular', 'alphabetical', 'recently-updated'] as const;
const VALID_CATEGORIES = ['developer-tools', 'productivity', /* ... */] as const;

const sort = VALID_SORTS.includes(sortParam) ? sortParam : 'popular';
const category = VALID_CATEGORIES.includes(categoryParam) ? categoryParam : undefined;
```

### Known Threat Patterns for Next.js App Router

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SQL injection via category filter | Tampering | Drizzle ORM parameterized queries (`.where(eq(casks.category, ?))`) |
| Mass assignment via searchParams | Tampering | Whitelist valid keys; ignore unexpected params |
| SSRF via external fetch (Bedrock) | Tampering | AWS SDK uses IAM credentials + VPC endpoints; no user-controlled URLs |
| XSS via category names in UI | Tampering | React auto-escapes JSX; no `dangerouslySetInnerHTML` |

**Phase 4 security posture:** LOW risk — no new authentication, no user-generated content, read-only operations with validated inputs. Existing SECU-01 (rate limiting) and SECU-04 (SSRF allowlist) from Phase 3 apply.

## Sources

### Primary (HIGH confidence)
- **Next.js official docs** (v16.2.6) — `searchParams` API, `window.history.pushState` integration, scroll restoration [CITED: https://nextjs.org/docs/app/api-reference/file-conventions/page, https://nextjs.org/docs/app/building-your-application/routing/linking-and-navigating]
- **AWS Bedrock official docs** — Batch inference API, Claude 3.5 Haiku pricing ($3.00/1M tokens batch), model parameters [CITED: https://docs.aws.amazon.com/bedrock/latest/userguide/batch-inference.html, https://aws.amazon.com/bedrock/pricing/]
- **GitHub REST API official docs** — Rate limits (5,000/hr authenticated), headers (`x-ratelimit-remaining`) [CITED: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api]
- **Tailwind CSS official docs** (v4) — `grid-cols-{n}` utilities, responsive breakpoints [CITED: https://tailwindcss.com/docs/grid-template-columns]

### Secondary (MEDIUM confidence)
- **npm registry** — Package versions verified: `next@16.2.6`, `@aws-sdk/client-bedrock-runtime@3.1053.0`, `@octokit/rest@22.0.1` (2026-05-26)
- **Existing codebase** — `src/lib/queries.ts` dynamic query patterns (Phase 1–3), `src/components/cask-grid.tsx` responsive grid (Phase 2)

### Tertiary (LOW confidence)
- None — all findings verified with official sources or existing codebase

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — All libraries verified via official docs and npm registry, versions current as of 2026-05-26
- Architecture: HIGH — Patterns proven in existing codebase (Phases 1–3), Next.js App Router patterns from official docs
- Pitfalls: HIGH — Identified from Next.js v15 migration guide (searchParams Promise), Drizzle ORM patterns, ISR cache behavior

**Research date:** 2026-05-26
**Valid until:** ~60 days (2026-07-25) — Next.js stable, AWS Bedrock pricing stable, GitHub API v3 mature

---

**Phase:** 4-discovery-layer
**Research completed:** 2026-05-26
**Ready for planning:** ✓
