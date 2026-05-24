# Phase 2: Catalog UI - Research

**Researched:** 2026-05-24
**Domain:** Next.js 15/16 App Router ISR, shadcn/ui + Tailwind v4, Drizzle ORM pagination, Clipboard API, next/image
**Confidence:** HIGH (core stack verified against official Next.js 16.2.6 docs; all packages slopcheck'd [OK])

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Run `/gsd-sketch` on browse grid + detail page before any production UI is built. CLAUDE.md mandates this and it is a hard constraint, not optional.
- **D-02:** Visual mood: dark / developer-first. Dark background, muted colors, developer-adjacent aesthetic (think GitHub or Raycast style). Light mode is out of scope for this phase.
- **D-03:** Sketch session should produce 2-3 variations of both browse grid and detail page. Design system (spacing, colors, card shape, typography) derives from the chosen variation. (**NOTE: Sketch session is already complete. Design system is captured in `02-UI-SPEC.md`. The sketch gate is satisfied. Planner does NOT need to include a sketch task.**)
- **D-04:** Cursor/page-based pagination. URL-driven (`?page=N`). Each page is a distinct ISR-cached Server Component — Postgres only runs for cache misses. No infinite scroll.
- **D-05:** 48 casks per page. Divisible by 2, 3, and 4. ~145 pages total at current cask count.
- **D-06:** Default sort: `install_365d DESC` (most popular).
- **D-07:** Cards show: icon + name + description. No install count badge, no version, no extra metadata on the card.
- **D-08:** Fallback icon: CSS initials avatar — colored square/circle, color derived from name hash (`djb2(token) % 6`).
- **D-09:** Description truncated to 2 lines (`line-clamp-2`). Cards have uniform height.
- **D-10:** Root route (`/`) redirects to `/browse`.
- **D-11:** Cask detail page URL: `/cask/[token]`.
- **D-12:** Header: BrewIndex branding + placeholder search bar (non-functional).

### Claude's Discretion

- Exact column count breakpoints (responsive grid — e.g., 2-col mobile, 3-col tablet, 4-col desktop)
- shadcn/ui card variant choice (which Card subcomponents to use)
- ISR revalidation tag strategy (must use `revalidateTag('casks')` consistent with Phase 1)
- `generateStaticParams` implementation details for top-500 pages
- Metadata (page title, OG tags) for browse and detail pages
- Error/not-found handling for invalid cask tokens
- Clipboard API implementation for the copy-install-command feature

### Deferred Ideas (OUT OF SCOPE)

- Dark mode toggle / light mode — deferred to a future phase or post-MVP
- Category filter on browse grid — Phase 4 (Discovery Layer)
- Sort controls (by alphabet, recently updated) — Phase 4
- Search functionality — Phase 3
- GitHub stats block on detail page — Phase 4 (DETL-05)
- Platform compatibility filter — Phase 3
- Cask caveats and install warnings — v2 requirement
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BRWS-01 | User can browse all Homebrew casks in a visual card grid layout showing name, icon, and short description | CaskCard component spec (02-UI-SPEC.md), grid layout, `unstable_cache` paginated Drizzle queries |
| BRWS-04 | User can paginate through 7,000+ casks without performance degradation | `?page=N` + `unstable_cache` DB caching; 48 casks/page; Neon serverless HTTP driver |
| DETL-01 | User can view a cask detail page with name, icon, description, version, and homepage link | `/cask/[token]` dynamic route with `generateStaticParams` (top-500 pre-rendered); single-cask Drizzle query |
| DETL-02 | User can copy the `brew install --cask <name>` command to clipboard in one click | Client Component island (`'use client'`) + `navigator.clipboard.writeText` + 2s confirmation state |
| DETL-03 | User can see current version and last updated date for a cask | `version` and `last_synced_at` fields on `CaskSelectRow`; formatted in detail hero |
| DETL-04 | User can see 30-day, 90-day, and 365-day install counts for a cask | `install_30d`, `install_90d`, `install_365d` fields on `CaskSelectRow`; stat cards in detail page |
</phase_requirements>

---

## Summary

Phase 2 delivers the visual catalog: a paginated browse grid at `/browse?page=N` and a detail page at `/cask/[token]`. The design system is fully specified in `02-UI-SPEC.md` — the sketch gate has been satisfied. Phase 1 already populated the Neon Postgres `casks` table and fires `revalidateTag("casks", "max")` after each sync.

**Critical architectural clarification (searchParams vs ISR):** The browse page uses `searchParams` (`?page=N`) which in Next.js App Router is a Request-time API that opts the page into *dynamic rendering* — the HTML is NOT cached at the CDN per-page. However, the Drizzle ORM queries are wrapped in `unstable_cache` with `tags: ['casks']`, so the database is NOT hit per-request. This satisfies the success criterion "no per-request Postgres queries" while keeping clean URL pagination. Only `/cask/[token]` pages achieve true CDN-level ISR (because `params` is not a Request-time API when pre-generated via `generateStaticParams`). The planner should communicate this distinction clearly.

**Primary recommendation:** Initialize shadcn/ui (it is NOT yet initialized — no `components.json` exists), override CSS vars with the exact token values from `02-UI-SPEC.md`, wrap all Drizzle queries in `unstable_cache(..., [...], { tags: ['casks'] })`, and implement the Copy button as a Client Component island.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Browse grid pagination | Frontend Server (SSR/dynamic) | Database | `searchParams` forces dynamic rendering; `unstable_cache` shields Postgres |
| Cask detail page rendering | Frontend Server (ISR) | Database | `params` from `generateStaticParams` — true ISR at CDN for top-500; on-demand for rest |
| Copy-to-clipboard | Browser / Client | — | `navigator.clipboard` is browser API; must be `'use client'` component island |
| Icon rendering + blur placeholder | Frontend Server (SSR) | CDN | `next/image` handled by Next.js Image Optimization API; blurDataURL generated server-side |
| ISR cache invalidation | API / Backend | — | `revalidateTag("casks", "max")` called in cron route (Phase 1) |
| Root redirect (`/` → `/browse`) | Frontend Server | — | `next/navigation` `redirect()` in page.tsx Server Component |
| Pagination URL state | Browser / Client | Frontend Server | URL `?page=N` read by Server Component via `searchParams` prop |
| Initials color derivation | Frontend Server (SSR) | — | `djb2(token) % 6` pure function; runs server-side at render time |

---

## Standard Stack

### Core (already in project)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.6 | App Router, SSR, ISR, `next/image` | Mandated; already installed |
| react + react-dom | 19.2.4 | Component model, `'use client'` islands | Mandated; already installed |
| drizzle-orm | 0.45.2 | Type-safe Drizzle queries; pagination via `.limit().offset()` | Already in project; `neon-http` driver established |
| @neondatabase/serverless | 1.1.0 | Serverless Postgres over HTTP | Already in project |
| tailwindcss | 4.3.0 | CSS-first utility classes; v4 `@theme inline` | Mandated; already installed |
| typescript | 5.x | Type safety | Mandated |
| lucide-react | 1.16.0 | UI chrome icons (`PackageX`, `PackageOpen`, `AlertTriangle`) | Already in project |

[VERIFIED: npm registry — versions confirmed via `npm view` 2026-05-24]

### New packages required for Phase 2

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn (CLI) | 4.8.0 | Install shadcn/ui components (Card, Button, Skeleton, Separator) | Official shadcn CLI; copy-paste model |
| class-variance-authority | 0.7.1 | Variant API for component styling | shadcn/ui dependency |
| clsx | 2.1.1 | Conditional class merging | shadcn/ui dependency |
| tailwind-merge | 3.6.0 | Tailwind class conflict resolution | shadcn/ui dependency |

[VERIFIED: npm registry — versions confirmed via `npm view` 2026-05-24; all packages [OK] via slopcheck 2026-05-24]

**Installation (new packages only):**
```bash
npm install class-variance-authority clsx tailwind-merge
npx shadcn init   # interactive: choose dark, CSS variables style — see Pattern 1 below
npx shadcn add card button skeleton separator
```

**Note:** `shadcn` (the CLI) is installed to the machine, not the project's `node_modules`. The install command above is a one-time scaffold; it generates `components.json` and copies component source files into `src/components/ui/`.

### Version verification

All versions confirmed via `npm view <pkg> version` on 2026-05-24:
- `next`: 16.2.6 (installed)
- `tailwindcss`: 4.3.0 (installed)
- `shadcn`: 4.8.0 (CLI — run with `npx shadcn@latest`)
- `class-variance-authority`: 0.7.1
- `clsx`: 2.1.1
- `tailwind-merge`: 3.6.0
- `lucide-react`: 1.16.0 (installed)

---

## Package Legitimacy Audit

> slopcheck was run on 2026-05-24 against npm registry.

| Package | Registry | Age | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|
| next | npm | 10+ yrs | [OK] | Approved |
| react | npm | 10+ yrs | [OK] | Approved |
| tailwindcss | npm | 6+ yrs | [OK] | Approved |
| shadcn | npm | 2+ yrs | [OK] | Approved |
| class-variance-authority | npm | 3+ yrs | [OK] | Approved |
| clsx | npm | 6+ yrs | [OK] | Approved |
| tailwind-merge | npm | 3+ yrs | [OK] | Approved |
| lucide-react | npm | 5+ yrs | [OK] | Approved |
| drizzle-orm | npm | 3+ yrs | [OK] | Approved |
| @neondatabase/serverless | npm | 2+ yrs | [OK] | Approved |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none
**postinstall scripts:** None of the above packages have postinstall scripts that reference network calls or external filesystem paths. [VERIFIED: npm view scripts 2026-05-24]

---

## Architecture Patterns

### System Architecture Diagram

```
Browser
  │
  ├── GET /                       → Server Component → redirect('/browse')
  │
  ├── GET /browse?page=N          → Server Component (DYNAMIC — searchParams is Request-time API)
  │     │                              ↓
  │     │                         unstable_cache('getCasks', [page], { tags: ['casks'] })
  │     │                              ↓
  │     │                         Neon Postgres (CACHE HIT: no DB call; CACHE MISS: Drizzle query)
  │     │                              ↓
  │     └── HTML: CaskCard grid, pagination controls, header (sticky)
  │
  ├── GET /cask/[token]           → Server Component (ISR — params from generateStaticParams)
  │     │                              ↓
  │     │                         unstable_cache('getCask', [token], { tags: ['casks'] })
  │     │                              ↓
  │     │                         Neon Postgres (CACHE HIT for top-500; first-request for rest)
  │     │                              ↓
  │     └── HTML: Hero, InstallBlock [CopyButton — 'use client' island], Stats, Metadata
  │
  └── (CopyButton click)         → navigator.clipboard.writeText('brew install --cask {token}')
                                     button state: "Copy" → "Copied!" (2000ms) → "Copy"

Phase 1 Cron (POST /api/cron/sync):
  └── revalidateTag("casks", "max")  →  marks all unstable_cache('casks') entries stale
                                         →  next visitor triggers background revalidation
```

### Recommended Project Structure

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (Geist fonts already wired)
│   ├── globals.css                   # REPLACE with UI-SPEC token values (@theme inline)
│   ├── page.tsx                      # redirect('/browse') — Server Component
│   ├── browse/
│   │   └── page.tsx                  # Browse grid — dynamic (searchParams), unstable_cache DB
│   └── cask/
│       └── [token]/
│           ├── page.tsx              # Detail page — ISR, generateStaticParams top-500
│           └── not-found.tsx         # notFound() fallback
├── components/
│   ├── ui/                           # shadcn/ui generated components (Card, Button, etc.)
│   ├── header.tsx                    # Sticky header (Server Component — no state)
│   ├── cask-card.tsx                 # Card grid item (Server Component)
│   ├── cask-grid.tsx                 # Grid container (Server Component)
│   ├── copy-button.tsx               # 'use client' island — clipboard API
│   ├── pagination.tsx                # URL-driven pagination controls (Server Component)
│   ├── initials-avatar.tsx           # CSS initials fallback (Server Component)
│   └── install-count.tsx             # formatInstallCount utility + display
├── lib/
│   ├── queries.ts                    # unstable_cache wrapped Drizzle queries
│   ├── format.ts                     # formatInstallCount, formatDate utilities
│   ├── hash.ts                       # djb2() + initials color derivation
│   └── blur-data-url.ts              # dark blurDataURL constant
└── db/
    ├── schema.ts                     # (existing — CaskSelectRow type)
    └── index.ts                      # (existing — db client)
```

### Pattern 1: shadcn/ui Initialization with Tailwind v4

**What:** `npx shadcn init` scaffolds `components.json`, installs dependencies, and creates `src/components/ui/`. With Tailwind v4, the CSS-first config replaces `tailwind.config.js`.

**When to use:** First task of the phase — MUST run before importing any shadcn components.

**Important:** After init, the generated `globals.css` will contain shadcn's default CSS variables. These MUST be replaced with the exact values from `02-UI-SPEC.md`. [CITED: ui.shadcn.com/docs/tailwind-v4]

```bash
# 1. Run init (choose: dark mode, CSS variables style, src/ directory)
npx shadcn@latest init
# Prompts: style=default, base color=slate (override in globals.css anyway), use CSS variables=yes

# 2. Install components used in Phase 2
npx shadcn@latest add card button skeleton separator
```

**`components.json` key fields (shadcn v4.x with Tailwind v4):**
```json
{
  "style": "default",
  "rsc": true,
  "tsx": true,
  "tailwind": {
    "config": "",
    "css": "src/app/globals.css",
    "baseColor": "slate",
    "cssVariables": true
  },
  "aliases": {
    "components": "@/components",
    "utils": "@/lib/utils"
  }
}
```
[CITED: ui.shadcn.com/docs/installation/next]

**After init, replace `globals.css` content with the exact tokens from `02-UI-SPEC.md`:**

```css
/* src/app/globals.css — Phase 2 exact token values from 02-UI-SPEC.md */
@import "tailwindcss";

:root {
  --color-bg:              #0e0e0e;
  --color-surface:         #1a1a1a;
  --color-surface-hover:   #222222;
  --color-surface-raised:  #242424;
  --color-border:          #2a2a2a;
  --color-border-subtle:   #1f1f1f;
  --color-text:            #f0f0f0;
  --color-text-muted:      #888888;
  --color-text-faint:      #555555;
  --color-primary:         #7c6aff;
  --color-primary-hover:   #9581ff;
  --color-primary-dim:     rgba(124,106,255,0.15);
  --color-success:         #4ade80;
  --color-danger:          #f87171;
  --radius-sm:  6px;
  --radius-md:  10px;
  --radius-lg:  14px;
  --radius-xl:  18px;
  --radius-full: 9999px;
  --shadow-sm:   0 1px 3px rgba(0,0,0,0.4);
  --shadow-md:   0 4px 12px rgba(0,0,0,0.5);
  --shadow-glow: 0 0 0 1px rgba(124,106,255,0.3), 0 4px 12px rgba(124,106,255,0.15);
}

@theme inline {
  --color-background: var(--color-bg);
  --color-foreground: var(--color-text);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

html { background-color: var(--color-bg); color: var(--color-text); }
body { font-family: var(--font-sans); }
```

[CITED: 02-UI-SPEC.md Tailwind v4 Token Mapping section]

**Tailwind v4 + shadcn CSS var coexistence rule:** shadcn uses `--background`, `--foreground`, etc. in its generated component files. The `@theme inline` block bridges shadcn's vars to Tailwind. Do NOT remove the `--color-background: var(--color-bg)` mapping — shadcn components reference `bg-background` which resolves through this. [CITED: ui.shadcn.com/docs/tailwind-v4]

### Pattern 2: unstable_cache for Drizzle ORM Queries

**What:** Wrap all Postgres queries in `unstable_cache` with `tags: ['casks']` so the Phase 1 `revalidateTag("casks", "max")` call invalidates them.

**When to use:** Every DB call in a Server Component that reads from the `casks` table.

**Important caveat on `revalidateTag` form:** The previous-model docs show `revalidateTag('casks')` (single-arg) with `unstable_cache`. Phase 1's sync route already uses `revalidateTag("casks", "max")` (2-arg — new form). The 2-arg form should also invalidate `unstable_cache` entries with matching tags — the behavior is consistent with the tag invalidation model. However, this is an `[ASSUMED]` claim (the official docs for Next.js 16 only show `fetch.next.tags` and `cacheTag` with the 2-arg form; `unstable_cache` + 2-arg `revalidateTag` is not explicitly documented together). In practice the sync route's 2-arg form is already committed — use it consistently.

```typescript
// src/lib/queries.ts
import { unstable_cache } from 'next/cache';
import { db } from '@/db';
import { casks } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';

const PAGE_SIZE = 48;

// Paginated browse query — keyed by page number
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
  ['casks-page'],               // key prefix — page number included as argument
  { tags: ['casks'] }           // invalidated by revalidateTag('casks', 'max')
);

// Total count for pagination math
export const getCasksCount = unstable_cache(
  async () => {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(casks)
      .where(eq(casks.is_active, true));
    return result[0].count;
  },
  ['casks-count'],
  { tags: ['casks'] }
);

// Single cask by token (detail page)
export const getCaskByToken = unstable_cache(
  async (token: string) => {
    const result = await db
      .select()
      .from(casks)
      .where(eq(casks.token, token))
      .limit(1);
    return result[0] ?? null;
  },
  ['cask-by-token'],            // token included as argument → separate cache entry per token
  { tags: ['casks'] }
);

// Top-500 tokens for generateStaticParams
export const getTop500Tokens = unstable_cache(
  async () => {
    return db
      .select({ token: casks.token })
      .from(casks)
      .where(eq(casks.is_active, true))
      .orderBy(desc(casks.install_365d))
      .limit(500);
  },
  ['top-500-tokens'],
  { tags: ['casks'] }
);
```

[CITED: nextjs.org/docs/app/guides/caching-without-cache-components — unstable_cache pattern]
[CITED: nextjs.org/docs/app/guides/incremental-static-regeneration — revalidateTag with unstable_cache]

### Pattern 3: generateStaticParams for Top-500 Detail Pages

**What:** Export `generateStaticParams` from `app/cask/[token]/page.tsx` to pre-render the top 500 casks at build time. Pages not in the list are rendered on-demand (ISR) when first visited.

**dynamicParams default is `true`** — unrecognized tokens are rendered on-demand, not 404'd.
[CITED: nextjs.org/docs/app/api-reference/functions/generate-static-params]

```typescript
// app/cask/[token]/page.tsx

import { getTop500Tokens, getCaskByToken } from '@/lib/queries';
import { notFound } from 'next/navigation';

// Pre-render top 500 at build time; rest render on-demand + cache
export async function generateStaticParams() {
  const tokens = await getTop500Tokens();
  return tokens.map((t) => ({ token: t.token }));
}

// dynamicParams = true (default) — remaining tokens render on first request
// export const dynamicParams = true; // no need to set, it's the default

export default async function CaskPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params;                  // params is a Promise in Next.js 15+
  const cask = await getCaskByToken(token);
  if (!cask) notFound();
  // ... render
}
```

**ISR behavior for non-pre-rendered cask pages:**
- First request: Postgres is hit (cache miss), page is rendered and cached.
- Subsequent requests: served from Next.js data cache until `revalidateTag('casks', 'max')` is called.
- After revalidation: stale page is served immediately; fresh page regenerated in background on next visit.

[CITED: nextjs.org/docs/app/api-reference/functions/generate-static-params — "Subset of paths at build time"]

### Pattern 4: searchParams for Browse Pagination

**Critical architectural note:** In Next.js App Router without `cacheComponents`, reading `searchParams` in a page component opts that page into **dynamic rendering** (no CDN-level HTML caching). The browse page `/browse?page=N` will be dynamically rendered per-request. However, `unstable_cache` still shields Postgres — the DB is not queried on every request, only on cache misses. This satisfies the success criterion "no per-request Postgres queries."

**True CDN-level ISR for the browse page would require path-based routing (`/browse/[page]`), which conflicts with D-04.** Use `unstable_cache` as the caching layer.

```typescript
// app/browse/page.tsx

import { getCasksPage, getCasksCount } from '@/lib/queries';

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>   // Promise in Next.js 15+
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  // Both calls are wrapped in unstable_cache — Postgres not hit on cache hits
  const [casks, totalCount] = await Promise.all([
    getCasksPage(page),
    getCasksCount(),
  ]);

  const totalPages = Math.ceil(totalCount / 48);
  // ... render grid and pagination
}
```

[CITED: nextjs.org/docs/app/api-reference/file-conventions/page#searchparams-optional]
[CITED: nextjs.org/docs/app/glossary#request-time-apis]

### Pattern 5: Copy Button as Client Component Island

**What:** The Copy button must be `'use client'` because `navigator.clipboard` is a browser API. The detail page is a Server Component. The Copy button is a small "island" within the server-rendered page.

```typescript
// components/copy-button.tsx
'use client';

import { useState } from 'react';

export function CopyButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`brew install --cask ${token}`);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('failed');
      setTimeout(() => setState('idle'), 2000);
    }
  }

  const label = state === 'copied' ? 'Copied!' : state === 'failed' ? 'Failed' : 'Copy';
  const bg = state === 'copied' ? '#4ade80' : state === 'failed' ? 'var(--color-danger)' : '#7c6aff';
  const color = state === 'copied' ? '#0a0a0a' : 'white';

  return (
    <button
      onClick={handleCopy}
      style={{ background: bg, color, minWidth: '80px' }}
      className="rounded-[6px] border-none px-4 text-[0.8125rem] font-bold transition-all duration-150 ease-linear hover:-translate-y-px"
    >
      {label}
    </button>
  );
}
```

[CITED: 02-UI-SPEC.md — Interaction Contracts: Copy Install Command]
[VERIFIED: MDN Clipboard API — navigator.clipboard.writeText is Promise-based, requires browser context]

### Pattern 6: next/image Configuration for Remote Icons

**remotePatterns** with wildcard for Vercel Blob subdomains. Add to `next.config.ts`: [CITED: nextjs.org/docs/app/api-reference/components/image#remotepatterns]

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'icons.duckduckgo.com' },
      { protocol: 'https', hostname: 'icon.horse' },
      { protocol: 'https', hostname: '**.public.blob.vercel-storage.com' },
      //   ^^ ** matches any number of subdomains (Vercel Blob wildcard)
    ],
  },
};

export default nextConfig;
```

**blurDataURL for dark placeholder:** Use an SVG data URL — accepted by next/image `placeholder="blur"`, simpler than encoding a PNG, produces a solid dark fill:

```typescript
// src/lib/blur-data-url.ts
// Stable dark placeholder for icon slots — #1a1a1a matches --color-surface
const svgPlaceholder =
  '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#1a1a1a"/></svg>';

export const DARK_BLUR_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(svgPlaceholder).toString('base64')}`;
// = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTFhMWEiLz48L3N2Zz4='
```

**Usage in CaskCard:**
```tsx
<Image
  src={cask.icon_url!}
  width={52}
  height={52}
  alt={`${cask.name} icon`}
  className="rounded-[10px]"
  placeholder="blur"
  blurDataURL={DARK_BLUR_DATA_URL}
/>
```

[CITED: nextjs.org/docs/app/api-reference/components/image#placeholder]
[CITED: 02-UI-SPEC.md — next/image Configuration section]

### Pattern 7: Initials Avatar with djb2 Hash

**What:** When `icon_is_fallback = true`, render a colored square with 1-2 uppercase initials derived from the cask `token`. Color is `djb2(token) % 6` index into a 6-slot palette.

```typescript
// src/lib/hash.ts
const INITIALS_PALETTE = [
  '#2563eb', // blue
  '#7c3aed', // violet
  '#059669', // emerald
  '#d97706', // amber
  '#dc2626', // red
  '#0891b2', // cyan
] as const;

export function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0; // int32 truncation
  }
  return Math.abs(hash);
}

export function getInitialsColor(token: string): string {
  return INITIALS_PALETTE[djb2(token) % 6];
}

export function getInitials(token: string): string {
  const parts = token.split('-').filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```

[CITED: 02-UI-SPEC.md — Initials Color Palette section]

### Pattern 8: Install Count Formatter

**What:** Consistent formatting across browse cards (installs pill) and detail stats cards.

```typescript
// src/lib/format.ts
export function formatInstallCount(value: number | null | undefined): string {
  if (value == null) return '—';
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.floor(value / 1_000)}K`;
  return String(value);
}
```

[CITED: 02-UI-SPEC.md — Install Count Formatting table]

### Anti-Patterns to Avoid

- **Using `revalidateTag` inside a Server Component render path:** `revalidateTag` must only be called in Route Handlers or Server Actions, not during render. Phase 1's cron route already does this correctly.
- **Reading `searchParams` outside the page component:** Do not pass `searchParams` through component trees. Read it once at the page level and pass extracted values as props.
- **Rendering `<Image>` with `icon_url` when `icon_is_fallback = true`:** Always check `icon_is_fallback` first. The `icon_url` field holds a placeholder text value (the token) when `icon_is_fallback = true`, not a real image URL.
- **Single-arg `revalidateTag('casks')` in new code:** The single-arg form is deprecated in Next.js 16. Use `revalidateTag('casks', 'max')` for stale-while-revalidate semantics, or `revalidateTag('casks', { expire: 0 })` for immediate expiration.
- **Importing shadcn components before `npx shadcn init`:** `components.json` does not exist yet. Importing from `@/components/ui/card` before initialization will cause a build error.
- **Not awaiting `params` and `searchParams`:** In Next.js 15+, both are Promises. `const { token } = await params` — synchronous access still works in Next.js 15 (backwards compat) but will be removed in the future.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Component primitives (Card, Button, Separator) | Custom HTML + CSS card | `npx shadcn add card button separator` | shadcn/ui provides a11y-correct Radix UI base, themed to CSS vars |
| Copy-to-clipboard timeout/state machine | Custom debounce/flag logic | Standard `useState` + `setTimeout` (30 lines max) | Small enough to hand-write; no library needed |
| Tailwind class merging | Custom string concatenation | `tailwind-merge` + `clsx` (from `@/lib/utils` generated by shadcn) | Handles specificity and conflicting classes correctly |
| Pagination math | Custom windowing algorithm | Inline logic for ±3 window with `…` | 15–20 lines; see Common Pitfalls for edge cases |
| Image optimization | `<img>` with manual srcset | `next/image` | Handles WebP conversion, lazy loading, blur placeholder, `remotePatterns` validation |
| Dark placeholder for icons | Blank grey div | SVG data URL as `blurDataURL` | 3-line constant; no external dependency |

**Key insight:** The shadcn copy-paste model means component code lives in `src/components/ui/` and is fully editable. Do not treat shadcn components as a locked library — the plan can modify them.

---

## Common Pitfalls

### Pitfall 1: searchParams Opts Browse Page into Dynamic Rendering

**What goes wrong:** Developer expects `/browse?page=2` to be CDN-cached (ISR), but it is dynamically rendered on every request because `searchParams` is a Request-time API.

**Why it happens:** Next.js App Router treats `searchParams` as inherently dynamic — its value can differ per-request.

**How to avoid:** Wrap all DB calls in `unstable_cache`. The DB result IS cached; only the HTML assembly per-request is "dynamic." For this project's success criteria ("no per-request Postgres queries"), this is sufficient. Do NOT add `export const dynamic = 'force-static'` to the browse page — that would make `searchParams` return empty and always render page 1.

**Warning signs:** `x-nextjs-cache: MISS` on every browse page request in production headers.

### Pitfall 2: revalidateTag + unstable_cache Compatibility in Next.js 16

**What goes wrong:** The previous-model docs show `revalidateTag('tag')` (single-arg) with `unstable_cache`. Next.js 16 deprecates the single-arg form. Phase 1 uses `revalidateTag("casks", "max")`. It is not explicitly documented whether the 2-arg form invalidates `unstable_cache` entries.

**Why it happens:** The docs for `revalidateTag` in Next.js 16 only show `fetch.next.tags` and `cacheTag` (for the `use cache` directive) as supported tag assignment mechanisms when using the 2-arg form.

**How to avoid:** Use the single-arg form for `unstable_cache` tag invalidation in the cache queries: `unstable_cache(fn, key, { tags: ['casks'] })`. Trust that `revalidateTag('casks', 'max')` from Phase 1 will invalidate these entries — this is consistent with the tag invalidation model across both old and new APIs. If cache invalidation is not working in production, add `revalidatePath('/browse', 'page')` as a belt-and-suspenders addition alongside `revalidateTag`.

**Warning signs:** Browse page still showing stale data >6 hours after a cron sync.

### Pitfall 3: shadcn/ui CSS Variables vs. Custom Token Names

**What goes wrong:** shadcn components reference `bg-background`, `text-foreground`, `border-border` etc. The UI-SPEC uses custom token names (`--color-bg`, `--color-surface`). If `@theme inline` mapping is wrong, shadcn components render with wrong colors.

**Why it happens:** shadcn uses its own CSS var names. Phase 2 adds custom vars. `@theme inline` bridges them.

**How to avoid:** Keep the `@theme inline` block: `--color-background: var(--color-bg)` and `--color-foreground: var(--color-text)`. shadcn components use `bg-background` which resolves to `var(--color-background)` which resolves to `var(--color-bg)` = `#0e0e0e`. The chain must stay intact. [CITED: ui.shadcn.com/docs/tailwind-v4]

**Warning signs:** shadcn `<Card>` renders with white background instead of dark.

### Pitfall 4: generateStaticParams + unstable_cache at Build Time

**What goes wrong:** `generateStaticParams` calls `getTop500Tokens()` which is wrapped in `unstable_cache`. At build time, `unstable_cache` caches the result. But the next cron sync fires `revalidateTag('casks', 'max')` — during the NEXT BUILD, not the current running server.

**Why it happens:** ISR revalidation only affects the running server's cache. `generateStaticParams` at build time always queries fresh data (the `unstable_cache` is cold at build start).

**How to avoid:** No action needed — this is the correct behavior. `generateStaticParams` always runs fresh at build time. The concern is only if someone incorrectly adds `revalidate: 0` or `no-store` to the `getTop500Tokens` query.

### Pitfall 5: not-found.tsx vs. notFound() Call

**What goes wrong:** Missing `not-found.tsx` file in `app/cask/[token]/` causes Next.js to use the root `not-found.tsx` when `notFound()` is called, which has a generic layout instead of the UI-SPEC design.

**Why it happens:** `notFound()` bubbles up to the nearest `not-found.tsx` in the route segment tree.

**How to avoid:** Create `app/cask/[token]/not-found.tsx` with the design from `02-UI-SPEC.md` (PackageX icon, "Cask not found" heading, "Browse all casks" CTA).

### Pitfall 6: icon_is_fallback Check Before Rendering next/image

**What goes wrong:** Passing `icon_url` to `<Image src=...>` when `icon_is_fallback = true` renders broken image or wrong content — the `icon_url` field stores a placeholder string, not an image URL, when fallback.

**How to avoid:** Always branch on `cask.icon_is_fallback` first:
```tsx
{cask.icon_is_fallback
  ? <InitialsAvatar token={cask.token} size={52} />
  : <Image src={cask.icon_url!} width={52} height={52} ... />
}
```

### Pitfall 7: Pagination Edge Cases

**What goes wrong:** Requesting `/browse?page=0` or `/browse?page=999` (beyond last page) either crashes or shows an empty grid.

**How to avoid:** Clamp page number: `Math.max(1, parseInt(pageParam ?? '1', 10) || 1)`. If `page > totalPages`, either redirect to page 1 or render an empty state with a "Go to first page" link. The pagination component should not render "Next" when already on the last page.

---

## Code Examples

### Browse Page Skeleton

```typescript
// app/browse/page.tsx
import { getCasksPage, getCasksCount } from '@/lib/queries';
import { CaskGrid } from '@/components/cask-grid';
import { Pagination } from '@/components/pagination';

const PAGE_SIZE = 48;

export const metadata = { title: 'Browse Casks — BrewIndex' };

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, parseInt(pageParam ?? '1', 10) || 1);

  const [casks, totalCount] = await Promise.all([
    getCasksPage(page),
    getCasksCount(),
  ]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <main className="mx-auto max-w-[1280px] px-6 pt-6 pb-8">
      <CaskGrid casks={casks} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </main>
  );
}
```

### Detail Page Skeleton

```typescript
// app/cask/[token]/page.tsx
import { getCaskByToken, getTop500Tokens } from '@/lib/queries';
import { notFound } from 'next/navigation';
import { CopyButton } from '@/components/copy-button';
import type { Metadata } from 'next';

export async function generateStaticParams() {
  const tokens = await getTop500Tokens();
  return tokens.map((t) => ({ token: t.token }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>
}): Promise<Metadata> {
  const { token } = await params;
  const cask = await getCaskByToken(token);
  if (!cask) return { title: 'Cask not found — BrewIndex' };
  return { title: `${cask.name} — BrewIndex` };
}

export default async function CaskPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params;
  const cask = await getCaskByToken(token);
  if (!cask) notFound();

  return (
    <main className="mx-auto max-w-[1100px] px-6">
      {/* Hero — Server Component */}
      {/* ... hero markup ... */}

      {/* Install command block — CopyButton is client island */}
      <div className="flex items-center gap-3 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 max-w-[640px]">
        <code className="flex-1 font-mono text-[0.8125rem]">
          <span className="text-[var(--color-text-faint)]">brew install --cask </span>
          <span className="text-[var(--color-primary-hover)]">{cask.token}</span>
        </code>
        <CopyButton token={cask.token} />
      </div>
    </main>
  );
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `params` and `searchParams` as sync props | Both are `Promise<{...}>` — must `await` | Next.js 15 | All page components must be `async` |
| `revalidateTag('tag')` single-arg | `revalidateTag('tag', 'max')` two-arg | Next.js 16 | Single-arg deprecated; TypeScript will error |
| `tailwind.config.js` for theme tokens | `globals.css` with `@theme inline` CSS | Tailwind v4 (2025) | No config file; all tokens in CSS |
| shadcn `@/components/ui` with v3 pattern | Same pattern, Tailwind v4 compatible since v4.8.0 | shadcn v4.0 (2025) | `init` handles v4 setup automatically |
| `priority` prop on `next/image` | `preload` prop (priority deprecated) | Next.js 16 | Use `preload` for above-fold images |
| `getStaticPaths` + `fallback: 'blocking'` | `generateStaticParams` + `dynamicParams = true` (default) | Next.js 13 App Router | ISR fallback is now the default |

**Deprecated/outdated:**
- `@vercel/kv`: Deprecated December 2024. Use `@upstash/redis` directly. Not needed for Phase 2.
- `experimental_ppr` route config: Removed in Next.js 16 (only relevant if `cacheComponents` is enabled).
- `unstable_cache` API: Marked for eventual replacement by `use cache` directive, but remains the standard for projects not using `cacheComponents`. Safe to use for this phase.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `revalidateTag("casks", "max")` (2-arg form) also invalidates `unstable_cache` entries tagged `'casks'`. The docs only explicitly document 2-arg form with `fetch.next.tags` and `cacheTag`/`use cache`. | Pattern 2, Pitfall 2 | Browse and detail pages would not update after cron sync. Mitigation: add `revalidatePath('/browse', 'page')` as belt-and-suspenders. |
| A2 | SVG data URLs are accepted by `next/image` `blurDataURL` (docs say "Data URL" without specifying formats). | Pattern 6 | blurDataURL silently ignored; no placeholder shown. Mitigation: use a minimal PNG base64 string instead (trivially substitutable). |
| A3 | shadcn `init` with the `src/` directory layout and Tailwind v4 produces a `components.json` with `"config": ""` (no tailwind.config.js path). | Pattern 1 | `init` may error or produce unexpected config if v4 detection logic changes in future CLI. Pin to `shadcn@4.8.0` if needed. |

---

## Open Questions

1. **revalidateTag 2-arg form + unstable_cache**
   - What we know: Phase 1 uses `revalidateTag("casks", "max")`; the previous-model docs show `revalidateTag('tag')` (single-arg) with `unstable_cache`.
   - What's unclear: Whether the 2-arg form invalidates `unstable_cache` entries the same way as the 1-arg form.
   - Recommendation: Use the 2-arg form as Phase 1 already does. Add `revalidatePath('/browse', 'page')` as fallback insurance if cache staleness is observed in production.

2. **Browse page Vercel cache behavior**
   - What we know: `/browse?page=N` is dynamically rendered (not full ISR). Vercel serves it from Edge Network for cached regions via Vercel's own edge cache (not Next.js ISR).
   - What's unclear: Whether Vercel's edge cache for dynamic pages has a meaningful TTL or caches at all for `?page=N` requests.
   - Recommendation: Do not count on CDN-level HTML caching for browse pages. `unstable_cache` ensures sub-millisecond Postgres calls on cache hits. This is sufficient for the 3-second performance target.

3. **fetch-allowlist.ts for Vercel Blob URLs**
   - What we know: `src/lib/fetch-allowlist.ts` does not include `*.public.blob.vercel-storage.com` in its allowlist (only `icons.duckduckgo.com`, `icon.horse`, `formulae.brew.sh`, `api.github.com`).
   - What's unclear: Whether the `safeFetch` wrapper is used for any server-side image URL resolution in Phase 2.
   - Recommendation: `next/image` fetches icon URLs server-side using its own fetch layer (not `safeFetch`). No `safeFetch` call is needed for rendering icons. The allowlist does NOT need updating for Phase 2. Confirm this is correct — if any server-side code needs to probe icon URLs (e.g., validation), the allowlist would need a wildcard entry for Blob.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Build, scripts | ✓ | v24.11.0 | — |
| npm | Package install | ✓ | 11.6.1 | — |
| npx (for shadcn CLI) | shadcn init | ✓ | bundled with npm | — |
| Neon Postgres (DATABASE_URL) | DB queries | [ASSUMED available in env] | — | Phase 1 established connection |
| Vercel Blob (BLOB_READ_WRITE_TOKEN) | Icon URLs in DB | [ASSUMED available in env] | — | Fallback icons exist (icon_is_fallback) |
| shadcn CLI (npx shadcn) | Component scaffolding | ✓ (via npx) | 4.8.0 | — |

**Missing dependencies with no fallback:** None blocking.

**shadcn initialization state:** `components.json` does NOT exist. `src/components/ui/` does NOT exist. The executor MUST run `npx shadcn@latest init` as the first task before importing any shadcn component.

---

## Project Constraints (from CLAUDE.md)

| Directive | How It Affects Phase 2 |
|-----------|----------------------|
| Next.js App Router + TypeScript only | All components are Server Components (default) or `'use client'` islands; no Pages Router patterns |
| Vercel deployment — ISR/static pages wherever possible | Detail pages (`/cask/[token]`) use `generateStaticParams` + ISR; browse pages use `unstable_cache` for DB caching |
| Security: Multi-layered DDoS/abuse protection first-class | Phase 2 is read-only; no new API routes introduced; no new rate-limiting surface (Phase 3 handles SECU-01/02) |
| Tailwind CSS v4.3 — CSS-first config, no `tailwind.config.js` | All tokens in `globals.css` under `@theme inline`; shadcn init compatible |
| shadcn/ui — CLI-installed, NOT npm-installed | `npx shadcn add` for components; `class-variance-authority`, `clsx`, `tailwind-merge` installed via npm |
| Design Process: 2-3 sketch variations before production UI | **SATISFIED** — sketches complete, design system captured in `02-UI-SPEC.md`. No new sketch session needed. |
| GSD Workflow Enforcement: use `/gsd-execute-phase`, not direct edits | Planner produces plans consumed by executor; no direct file edits outside GSD workflow |

---

## Sources

### Primary (HIGH confidence)
- `nextjs.org/docs/app/api-reference/functions/unstable_cache` — unstable_cache API, tags, revalidate options [VERIFIED 2026-05-24, Next.js 16.2.6 docs]
- `nextjs.org/docs/app/api-reference/functions/generate-static-params` — generateStaticParams, dynamicParams, subset-of-paths pattern [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/api-reference/functions/revalidateTag` — 2-arg form, deprecation of 1-arg, supported tag sources [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/guides/caching-without-cache-components` — Previous model; unstable_cache + revalidateTag integration [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/guides/incremental-static-regeneration` — ISR mechanics, on-demand revalidation pattern [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/api-reference/file-conventions/page` — searchParams as Request-time API, Promise type, dynamic rendering [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/api-reference/components/image` — remotePatterns wildcard syntax, placeholder/blurDataURL, priority deprecation [VERIFIED 2026-05-24]
- `nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents` — cacheComponents is opt-in, NOT enabled by default [VERIFIED 2026-05-24]
- `ui.shadcn.com/docs/components/card` — Card subcomponents: Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction, CardFooter [VERIFIED 2026-05-24]
- `ui.shadcn.com/docs/tailwind-v4` — @theme inline, CSS var coexistence pattern [VERIFIED 2026-05-24]
- `orm.drizzle.team/docs/select#limit--offset` — limit/offset pagination pattern [VERIFIED 2026-05-24]
- `02-UI-SPEC.md` — Complete design system: tokens, components, interactions, ISR contract [VERIFIED — project file, 2026-05-24]
- `src/db/schema.ts` — Live `CaskSelectRow` type, all available fields [VERIFIED — codebase, 2026-05-24]
- `src/app/api/cron/sync/route.ts` — Phase 1 uses `revalidateTag("casks", "max")` — 2-arg form [VERIFIED — codebase, 2026-05-24]
- npm registry — all package versions confirmed via `npm view` [VERIFIED 2026-05-24]
- slopcheck — all packages rated [OK] [VERIFIED 2026-05-24]

### Secondary (MEDIUM confidence)
- `nextjs.org/docs/app/glossary` — Request-time APIs definition; searchParams listed explicitly [VERIFIED 2026-05-24]

### Tertiary (LOW confidence / ASSUMED)
- A1: `revalidateTag('tag', 'max')` invalidates `unstable_cache` entries — inferred from tag model, not explicitly documented for 2-arg form [ASSUMED]
- A2: SVG data URL accepted as `blurDataURL` in next/image — inferred from "Data URL" description in docs, not format-specific [ASSUMED]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all packages verified via npm registry and slopcheck
- Architecture: HIGH — Next.js 16.2.6 official docs verified for all key patterns
- ISR/Caching: MEDIUM-HIGH — unstable_cache + revalidateTag(2-arg) interaction is ASSUMED compatible; all other ISR patterns are HIGH
- Component patterns: HIGH — shadcn docs and UI-SPEC both verified
- Pitfalls: HIGH — derived from official docs and verified codebase state

**Research date:** 2026-05-24
**Valid until:** 2026-06-24 (30-day estimate; Next.js and shadcn both move fast — recheck if either releases a major version)
