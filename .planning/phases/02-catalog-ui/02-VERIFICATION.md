---
phase: 02-catalog-ui
verified: 2026-05-24T15:00:00Z
status: human_needed
score: 17/17 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the app at /browse and visually confirm the card grid renders with dark theme (background #0e0e0e, surface cards #1a1a1a)"
    expected: "Cards appear in a dark grid; no white flash or light-theme bleed from shadcn CSS variables; @theme inline bridge is working correctly at runtime"
    why_human: "CSS variable resolution via @theme inline bridge cannot be verified by grep — only browser rendering confirms the bridge works end-to-end"
  - test: "Resize the browser window on /browse to verify the grid reflows correctly using repeat(auto-fill, minmax(460px, 1fr))"
    expected: "Cards stack to fewer columns as the window narrows; no horizontal scroll; grid behaves responsively"
    why_human: "CSS grid layout behavior requires visual inspection in a browser"
  - test: "On a cask detail page, click the Copy button and verify it shows 'Copied!' for approximately 2 seconds then reverts to 'Copy'"
    expected: "Button transitions through idle → copied (green #4ade80) → idle; clipboard contains 'brew install --cask {token}'"
    why_human: "navigator.clipboard interaction and state machine timing require browser execution"
  - test: "Navigate to /cask/does-not-exist and verify the not-found page renders"
    expected: "PackageX icon, 'Cask not found' heading, and 'Browse all casks' pill CTA are visible; URL does not redirect"
    why_human: "Next.js notFound() cascade to not-found.tsx requires actual request routing to verify"
  - test: "On /browse, click a cask card and verify SPA navigation to /cask/{token} without a full page reload"
    expected: "Next.js Link component triggers client-side navigation; header remains mounted (no flicker)"
    why_human: "SPA navigation behavior requires browser observation"
---

# Phase 2: Catalog UI Verification Report

**Phase Goal:** Users can browse the full cask catalog visually and get everything they need to install an app from its detail page
**Verified:** 2026-05-24T15:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | shadcn/ui initialized with components.json present and dark CSS variables style | VERIFIED | `components.json` exists with `"cssVariables": true`, `"rsc": true`, `"tsx": true`; `src/components/ui/{card,button,skeleton,separator}.tsx` all present |
| 2 | globals.css contains all UI-SPEC color tokens under :root and an @theme inline block bridging them to shadcn | VERIFIED | 14 color tokens, 5 radius tokens, 3 shadow tokens present in `:root`; `@theme inline` maps `--color-background: var(--color-bg)` and `--color-foreground: var(--color-text)`; no `@media (prefers-color-scheme: dark)` |
| 3 | next/image remotePatterns allows DuckDuckGo, icon.horse, and Vercel Blob domains | VERIFIED | `next.config.ts` has all three patterns: `icons.duckduckgo.com`, `icon.horse`, `*.public.blob.vercel-storage.com` |
| 4 | src/lib/queries.ts exports four unstable_cache-wrapped Drizzle functions: getCasksPage, getCasksCount, getCaskByToken, getTop500Tokens | VERIFIED | All four functions present and wrapped with `unstable_cache`; 5 occurrences of `unstable_cache` (4 wraps + 1 import) |
| 5 | All queries filter WHERE is_active = true and are tagged with { tags: ['casks'] } | VERIFIED | 4 occurrences of `eq(casks.is_active, true)` and 4 occurrences of `tags: ['casks']` confirmed via grep |
| 6 | src/lib/format.ts exports formatInstallCount that formats numbers per the UI-SPEC table | VERIFIED | Null → `'—'`, ≥1M → `toFixed(1)M`, ≥1K → `Math.floor/1000 K`, else raw integer — exact spec match |
| 7 | src/lib/hash.ts exports djb2, getInitialsColor, getInitials using the 6-slot palette from UI-SPEC | VERIFIED | All three functions exported; palette contains all 6 specified colors (`#2563eb` through `#0891b2`); djb2 algorithm correct; getInitials splits on `-` |
| 8 | src/lib/blur-data-url.ts exports DARK_BLUR_DATA_URL as a base64 SVG data URL | VERIFIED | Exports `DARK_BLUR_DATA_URL`; SVG fill is `#1a1a1a` matching `--color-surface`; uses `Buffer.from().toString('base64')` |
| 9 | GET / returns a redirect response to /browse | VERIFIED | `src/app/page.tsx` calls `redirect('/browse')` with no JSX — pure redirect |
| 10 | GET /browse?page=1 renders a grid of 48 cask cards sorted by install_365d DESC | VERIFIED | `getCasksPage` uses `.limit(48).orderBy(desc(casks.install_365d))`; `BrowsePage` fetches via `Promise.all`; `CaskGrid` maps over results |
| 11 | Each card shows icon/initials, name, description clamped to 2 lines, installs pill, platform pill, token | VERIFIED | `CaskCard` branches on `icon_is_fallback`; uses `WebkitLineClamp: 2`; shows `↓ {count} / yr` pill, `macOS` pill, and `{cask.token}` mono span |
| 12 | Pagination controls appear with ← Prev, page numbers (window ±3), and Next → | VERIFIED | `Pagination` component builds ±3 window, inserts `'...'` ellipsis, renders `← Prev` / `Next →` with disabled spans at boundaries; "Page N of total" label below |
| 13 | Sticky header shows BrewIndex logo chip, wordmark, disabled search bar, and cask count | VERIFIED | `header.tsx` has `position: 'sticky'`, `height: '56px'`; logo chip with `linear-gradient(135deg, #7c6aff, #c084fc)`; search input with `disabled` + `opacity: 0.55`; cask count span |
| 14 | Detail page shows cask name, 80px icon, description, version, last-updated, homepage link, install command, stats block | VERIFIED | `CaskPage` renders hero with `fontSize: '2rem'`, `letterSpacing: '-0.03em'` h1; `InitialsAvatar size={80}` or `Image width={80}`; `v{version} · Last updated {relative}` line; install section; three stat cards (30d/90d/365d); metadata table (Token/Version/Updated/Homepage) |
| 15 | Top 500 casks pre-rendered at build time via generateStaticParams | VERIFIED | `generateStaticParams` exported from `src/app/cask/[token]/page.tsx`; calls `getTop500Tokens()` and maps to `{ token }` params |
| 16 | CopyButton writes 'brew install --cask {token}' to clipboard; shows 'Copied!' for 2 seconds | VERIFIED | `'use client'` as first line; `useState<'idle' | 'copied' | 'failed'>`; `navigator.clipboard.writeText('brew install --cask ' + token)`; `setTimeout(() => setState('idle'), 2000)`; label is `'Copied!'` |
| 17 | GET /cask/does-not-exist returns not-found page with 'Cask not found' and Browse CTA | VERIFIED | `not-found.tsx` has `PackageX` icon, "Cask not found" h1, `Link href="/browse"` CTA; `CaskPage` calls `notFound()` when `getCaskByToken` returns null |

**Score:** 17/17 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `components.json` | shadcn/ui scaffold config with cssVariables | VERIFIED | `"cssVariables": true`, `"rsc": true`, `"config": ""` |
| `src/app/globals.css` | Design tokens and @theme inline bridge | VERIFIED | Full `:root` block + `@theme inline` bridge; no light-mode overrides |
| `next.config.ts` | next/image remotePatterns | VERIFIED | All 3 domains including wildcard Blob domain |
| `src/lib/queries.ts` | All DB query functions | VERIFIED | 4 exported `unstable_cache`-wrapped functions |
| `src/lib/format.ts` | Install count formatter | VERIFIED | `formatInstallCount` exported, handles null/M/K/raw |
| `src/lib/hash.ts` | djb2 hash and initials palette | VERIFIED | `djb2`, `getInitialsColor`, `getInitials` all exported |
| `src/lib/blur-data-url.ts` | Dark blur placeholder constant | VERIFIED | `DARK_BLUR_DATA_URL` exported as base64 SVG |
| `src/app/page.tsx` | Root redirect to /browse | VERIFIED | Single `redirect('/browse')` call, no JSX |
| `src/app/browse/page.tsx` | Browse grid page (dynamic, unstable_cache DB) | VERIFIED | Async Server Component; `searchParams: Promise<{page?}>` awaited; `Promise.all` parallel fetch; no `force-static` |
| `src/components/header.tsx` | Sticky header with logo + search bar + cask count | VERIFIED | `Header` named export; sticky, 56px, gradient logo chip |
| `src/components/cask-card.tsx` | Individual card component | VERIFIED | `CaskCard` named export; full implementation with icon branch, line-clamp, metadata strip |
| `src/components/cask-grid.tsx` | Grid container rendering list of CaskCards | VERIFIED | `CaskGrid` named export; `repeat(auto-fill, minmax(460px, 1fr))`; empty state |
| `src/components/initials-avatar.tsx` | CSS initials fallback avatar | VERIFIED | `InitialsAvatar` named export; imports from `@/lib/hash` |
| `src/components/pagination.tsx` | URL-driven pagination with ±3 window | VERIFIED | `Pagination` named export; full window algorithm; ellipsis; active state |
| `src/app/cask/[token]/page.tsx` | Detail page with ISR and all sections | VERIFIED | `generateStaticParams`, `generateMetadata`, `CaskPage` all exported |
| `src/app/cask/[token]/not-found.tsx` | Not found state for invalid tokens | VERIFIED | `NotFound` default export; PackageX + "Cask not found" + Browse CTA |
| `src/components/copy-button.tsx` | Client Component island for clipboard copy | VERIFIED | `'use client'` first line; `CopyButton` named export; full state machine |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `src/lib/queries.ts` | `src/db/index.ts` | `import { db } from '@/db'` | WIRED | Line 2 of queries.ts |
| `src/lib/queries.ts` | `src/db/schema.ts` | `import { casks } from '@/db/schema'` | WIRED | Line 3 of queries.ts |
| `src/app/globals.css` | `@theme inline` | `--color-background: var(--color-bg)` | WIRED | Line 30 of globals.css |
| `src/app/browse/page.tsx` | `src/lib/queries.ts` | `getCasksPage`, `getCasksCount` | WIRED | Line 3 import; used in Promise.all |
| `src/components/cask-card.tsx` | `src/lib/hash.ts` | `getInitialsColor`, `getInitials` via InitialsAvatar | WIRED | InitialsAvatar imports from `@/lib/hash`; CaskCard uses InitialsAvatar |
| `src/components/cask-card.tsx` | `src/lib/format.ts` | `formatInstallCount` | WIRED | Line 5 import; used in installs pill |
| `src/app/cask/[token]/page.tsx` | `src/lib/queries.ts` | `getCaskByToken`, `getTop500Tokens` | WIRED | Line 1 import; used in generateStaticParams and CaskPage |
| `src/app/cask/[token]/page.tsx` | `src/components/copy-button.tsx` | `CopyButton` island in install block | WIRED | Line 4 import; `<CopyButton token={c.token} />` at line 190 |
| `src/components/copy-button.tsx` | `navigator.clipboard` | `navigator.clipboard.writeText` in handleCopy | WIRED | Line 10 of copy-button.tsx |
| `src/app/layout.tsx` | `src/components/header.tsx` | `Header` in layout body | WIRED | Lines 4, 35 of layout.tsx |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `src/app/browse/page.tsx` | `pageCasks` | `getCasksPage(page)` → Drizzle `db.select().from(casks)` | Yes — full SELECT query with WHERE, ORDER BY, LIMIT, OFFSET | FLOWING |
| `src/app/browse/page.tsx` | `totalCount` | `getCasksCount()` → Drizzle `db.select({ count: sql... })` | Yes — COUNT(*) query | FLOWING |
| `src/components/header.tsx` | `caskCount` | `getCasksCount()` in `RootLayout` via `src/app/layout.tsx` | Yes — passed as prop from real DB count | FLOWING |
| `src/app/cask/[token]/page.tsx` | `cask` | `getCaskByToken(token)` → Drizzle `db.select().from(casks).where(and(...))` | Yes — full SELECT with is_active + token WHERE | FLOWING |

---

### Behavioral Spot-Checks

Step 7b skipped — verifying without a running server; TypeScript compilation (`npx tsc --noEmit`) passes with exit 0, confirming structural correctness.

---

### Probe Execution

No probes declared for Phase 2. Phase 2 is a UI phase (no `scripts/*/tests/probe-*.sh` files exist for catalog-ui).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| BRWS-01 | 02-02 | User can browse all Homebrew casks in a visual card grid | SATISFIED | `CaskGrid` with `CaskCard` renders name, icon/avatar, description; wired to real `getCasksPage` query |
| BRWS-04 | 02-02 | User can paginate through 7,000+ casks without degradation | SATISFIED | `Pagination` with ±3 window; DB query uses `LIMIT 48 OFFSET (page-1)*48`; `unstable_cache` shields DB from per-request hits |
| DETL-01 | 02-03 | User can view detail page with name, icon, description, version, homepage | SATISFIED | `CaskPage` renders all fields; hero section with h1, version/date line, full description, homepage link |
| DETL-02 | 02-03 | User can copy brew install command in one click | SATISFIED | `CopyButton` island with `navigator.clipboard.writeText`; 'Copied!' feedback implemented |
| DETL-03 | 02-03 | User can see current version and last updated date | SATISFIED | Version shown as `v{version}` in hero; `formatRelativeDate(last_synced_at)` shown as relative time; absolute date in metadata table |
| DETL-04 | 02-03 | User can see 30d/90d/365d install counts | SATISFIED | Three stat cards rendered with `formatInstallCount` applied to `install_30d`, `install_90d`, `install_365d` |

**No orphaned requirements.** REQUIREMENTS.md maps BRWS-01, BRWS-04, DETL-01–04 to Phase 2. All 6 are claimed and verified by Phase 2 plans.

---

### Anti-Patterns Found

| File | Pattern | Severity | Assessment |
|------|---------|----------|------------|
| `src/components/header.tsx:40` | Comment "disabled placeholder" | Info | The comment refers to the search bar being disabled. This is an intentional Phase 3 deferral (search is Phase 3). The `disabled` attribute on the input is correct spec behavior — not a code stub. |
| `src/components/header.tsx:43` | `placeholder="Search casks…"` | Info | HTML `placeholder` attribute on an `<input>` — not a stub anti-pattern. |
| `src/app/cask/[token]/page.tsx:92` | `placeholder="blur"` | Info | `next/image` `placeholder` prop — correct usage, not a code stub. |

No blockers. The word "placeholder" appears only as legitimate HTML attributes and code comments referencing intentionally deferred search functionality (Phase 3 scope). No `TBD`, `FIXME`, or `XXX` markers found.

---

### Human Verification Required

The automated checks passed on all 17 must-haves. The following items require a running browser to fully verify:

#### 1. Dark Theme CSS Variable Resolution

**Test:** Start the dev server (`npm run dev`) and open `http://localhost:3000/browse`. Inspect the page background and card backgrounds.
**Expected:** Page background is `#0e0e0e`; cards are `#1a1a1a`; shadcn components (if any) render dark (not white). The `@theme inline` bridge mapping `--color-background: var(--color-bg)` must resolve correctly at runtime.
**Why human:** CSS custom property resolution through the `@theme inline` bridge can only be confirmed in a real browser render — grep cannot confirm runtime CSS cascade behavior.

#### 2. Responsive Grid Layout

**Test:** On `/browse`, resize the browser window from wide (>1280px) to narrow (<600px).
**Expected:** Grid reflows from multi-column to single column using `repeat(auto-fill, minmax(460px, 1fr))`; no horizontal scroll; cards maintain readable layout at all widths.
**Why human:** CSS grid behavior requires visual inspection.

#### 3. CopyButton Interaction

**Test:** Navigate to any cask detail page (e.g., `/cask/visual-studio-code`). Click the "Copy" button.
**Expected:** Button turns green and shows "Copied!" text; after approximately 2 seconds it reverts to "Copy" in purple. Paste into a text editor and confirm the clipboard contains `brew install --cask visual-studio-code`.
**Why human:** `navigator.clipboard` API requires browser execution and user gesture.

#### 4. Not-Found Page Rendering

**Test:** Navigate to `/cask/this-cask-definitely-does-not-exist`.
**Expected:** Page shows PackageX icon, "Cask not found" heading, and a "Browse all casks" pill link. HTTP status is 404 (verifiable via browser DevTools Network tab).
**Why human:** Next.js `notFound()` → `not-found.tsx` cascade requires actual HTTP routing.

#### 5. Card-to-Detail SPA Navigation

**Test:** On `/browse`, click any cask card.
**Expected:** Browser navigates to `/cask/{token}` via SPA (no full page reload); header remains mounted without flicker; back button returns to `/browse`.
**Why human:** Next.js `Link`-based SPA navigation behavior requires browser observation.

---

### Gaps Summary

No gaps found. All 17 must-haves verified. All 6 phase requirements (BRWS-01, BRWS-04, DETL-01–04) are satisfied by substantive, wired, data-flowing implementations. TypeScript compiles clean (`npx tsc --noEmit` exit 0).

Status is `human_needed` — not `passed` — because 5 behavioral items require browser execution to confirm end-to-end runtime behavior, particularly the CSS variable bridge, CopyButton clipboard interaction, and SPA navigation.

---

_Verified: 2026-05-24T15:00:00Z_
_Verifier: Claude (gsd-verifier)_
