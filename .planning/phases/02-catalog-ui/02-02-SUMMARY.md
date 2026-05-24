---
phase: 02-catalog-ui
plan: "02"
subsystem: browse-ui
tags: [browse, header, cask-card, pagination, initials-avatar, next-image, server-components]
dependency_graph:
  requires:
    - 02-01 (shadcn init, design tokens, lib utilities — getCasksPage, getCasksCount, formatInstallCount, djb2/getInitialsColor/getInitials, DARK_BLUR_DATA_URL)
  provides:
    - Root redirect (/ → /browse)
    - Header component with sticky positioning and cask count
    - InitialsAvatar with djb2-derived color palette
    - CaskCard with icon/initials branching, description line-clamp, metadata strip
    - CaskGrid with auto-fill grid layout and empty state
    - Pagination with ±3 window, ellipsis, active accent, page label
    - Browse page (/browse?page=N) with searchParams pagination and unstable_cache DB shielding
  affects:
    - 02-03 (detail page) can reuse InitialsAvatar, Header
tech_stack:
  added: []
  patterns:
    - Server Component default for all components (no 'use client')
    - Inline style objects for CSS var references (avoids Tailwind v4 arbitrary value conflicts)
    - CSS -webkit-line-clamp for description truncation (D-09)
    - next/image with blurDataURL for icon slots
    - Next.js Link wrapping entire CaskCard (SPA navigation)
    - Promise.all for parallel getCasksPage + getCasksCount
    - Math.max(1, parseInt(...) || 1) clamping for searchParams page input (T-02-04)
    - Redirect on page > totalPages (T-02-05)
key_files:
  created:
    - src/app/browse/page.tsx
    - src/components/header.tsx
    - src/components/cask-card.tsx
    - src/components/cask-grid.tsx
    - src/components/initials-avatar.tsx
    - src/components/pagination.tsx
  modified:
    - src/app/page.tsx
    - src/app/layout.tsx
decisions:
  - Inline style objects used for CSS custom property references instead of Tailwind arbitrary values — avoids potential Tailwind v4 parsing edge cases with var() syntax inside brackets
  - Header rendered in layout.tsx (not browse/page.tsx) so it persists across all routes
  - Pagination renders null when totalPages <= 1 (no pagination bar for single-page catalogs)
  - Redirect to last page (not page 1) when page > totalPages to preserve user intent
metrics:
  duration: ~22 minutes
  completed: 2026-05-24
  tasks_completed: 2
  files_created: 6
  files_modified: 2
---

# Phase 02 Plan 02: Browse Page Vertical Slice Summary

**One-liner:** Full browse experience delivered — sticky header with live cask count, card grid with icon/initials rendering and 2-line description clamp, and URL-driven pagination with ±3 window.

---

## What Was Built

### Task 1: Root redirect + Header + InitialsAvatar + CaskCard

**src/app/page.tsx** replaced with a single-line Server Component that calls `redirect('/browse')` from `'next/navigation'`. Satisfies D-10 — no marketing page, direct redirect.

**src/components/header.tsx** created as a Server Component with:
- Sticky header at 56px height, z-index 50, `--color-bg` background with `--color-border` bottom border
- Logo chip: 24×24px div with `linear-gradient(135deg, #7c6aff, #c084fc)` and 6px border-radius
- BrewIndex wordmark: 1rem, weight 700, letter-spacing -0.02em
- Disabled search input: `max-width: 480px`, `opacity: 0.55`, `cursor: not-allowed`
- Live cask count span: `{caskCount.toLocaleString()} casks` at 0.8125rem muted text

**src/components/initials-avatar.tsx** created as a Server Component:
- Props: `{ token: string; size: number }`
- Imports `getInitialsColor` and `getInitials` from `@/lib/hash`
- Border-radius: 10px for size < 72, 18px for size >= 72
- Font-size: 18px for small, 30px for large (size >= 72)

**src/components/cask-card.tsx** created as a Server Component:
- Entire card wrapped in `<Link href={'/cask/' + cask.token}>` for SPA navigation
- Icon slot: branches on `!cask.icon_is_fallback && cask.icon_url` — renders `<Image>` with `blurDataURL={DARK_BLUR_DATA_URL}` when real icon available, `<InitialsAvatar token={cask.token} size={52} />` otherwise
- Header row: name (700 weight, ellipsis overflow) + version (Geist Mono, 0.6875rem, text-faint)
- Description: `-webkit-line-clamp: 2` with WebkitBoxOrient/WebkitBox for uniform card height (D-09)
- Metadata strip: installs pill (accent color), macOS platform pill (neutral), token (mono, right-aligned)

### Task 2: CaskGrid + Pagination + Browse page + Layout update

**src/components/cask-grid.tsx** created as a Server Component:
- Empty state: centered layout with `PackageOpen` icon (48px), "No casks available" heading, syncing message
- Grid: `display: grid`, `gridTemplateColumns: repeat(auto-fill, minmax(460px, 1fr))`, `gap: 12px`
- Maps over casks array, renders `<CaskCard key={cask.token} cask={cask} />` for each

**src/components/pagination.tsx** created as a Server Component:
- Returns null when `totalPages <= 1`
- Page window: includes page 1, totalPages, ±3 around currentPage. Inserts `'...'` (ellipsis) where consecutive pages differ by more than 1
- "← Prev" rendered as `<span>` (disabled) on page 1, `<Link>` otherwise
- "Next →" rendered as `<span>` (disabled) on last page, `<Link>` otherwise
- Active page: `--color-primary-dim` background, `--color-primary` border, `--color-primary-hover` text
- Page label: "Page {N} of {total}" centered below buttons

**src/app/browse/page.tsx** created as an async Server Component:
- Exports `metadata: Metadata = { title: 'Browse Casks — BrewIndex' }`
- `searchParams: Promise<{ page?: string }>` — awaited per Next.js 15+ pattern
- Page clamping: `Math.max(1, parseInt(pageParam ?? '1', 10) || 1)` (T-02-04 mitigation)
- Parallel fetch: `Promise.all([getCasksPage(page), getCasksCount()])`
- Redirect to last page if `page > totalPages && totalPages > 0` (T-02-05 mitigation)
- No `force-static` — searchParams requires dynamic rendering; DB shielded by `unstable_cache`

**src/app/layout.tsx** augmented:
- Made `async` to call `getCasksCount()`
- Imports `Header` from `@/components/header` and `getCasksCount` from `@/lib/queries`
- `<Header caskCount={caskCount} />` injected immediately inside `<body>` before `{children}`
- Root metadata updated: title `'BrewIndex'`, description `'Discover and install macOS apps available via Homebrew'`

---

## Verification

All plan verification checks pass:
1. `grep -c 'redirect' src/app/page.tsx` → 2 (import + call)
2. `grep -c 'repeat(auto-fill' src/components/cask-grid.tsx` → 1
3. `grep -c 'minmax(460px' src/components/cask-grid.tsx` → 1
4. `grep -c '← Prev' src/components/pagination.tsx` → 3 (appears in multiple places due to disabled span and Link)
5. `npx tsc --noEmit` → exits 0
6. `npm run build` → exits 0 (all 6 routes compile, browse shows as `ƒ` dynamic)

---

## Deviations from Plan

### Auto-fixed Issues

None required. Plan executed exactly as written.

### Notes

**Inline styles vs. Tailwind arbitrary values:** The plan suggested mixing inline styles and Tailwind arbitrary value classes (e.g., `hover:[box-shadow:var(--shadow-glow)]`). The final implementation uses inline styles for all CSS custom property references and Tailwind utility classes for hover state overrides on the card. The hover effect for card border and background uses Tailwind arbitrary values (`hover:border-[rgba(124,106,255,0.4)] hover:bg-[var(--color-surface-hover)] hover:[box-shadow:var(--shadow-glow)]`) which are fully supported in Tailwind v4.

---

## Known Stubs

None. All UI components are wired to real data from the `queries.ts` functions established in Plan 02-01. The cask count in the header fetches live from the database (via `unstable_cache`). The browse grid renders real casks sorted by `install_365d DESC`.

The search bar in Header is intentionally non-functional (`disabled` attribute) — this is not a stub but a planned Phase 3 placeholder per D-12.

---

## Threat Flags

No new security surface beyond what the plan's threat model already documented:

| Flag | File | Description |
|------|------|-------------|
| (mitigated) T-02-04 | src/app/browse/page.tsx | searchParams ?page=N — clamped via Math.max + parseInt, NaN-safe |
| (mitigated) T-02-05 | src/app/browse/page.tsx | Large page values — redirect to last page prevents runaway offset |

---

## Self-Check: PASSED

- [x] `src/app/page.tsx` contains `redirect('/browse')`: FOUND
- [x] `src/components/header.tsx` contains `position: 'sticky'` and `height: '56px'`: FOUND
- [x] `src/components/header.tsx` exports named `Header`: FOUND
- [x] `src/components/header.tsx` contains `linear-gradient(135deg, #7c6aff, #c084fc)`: FOUND
- [x] `src/components/header.tsx` contains `disabled` attribute and `opacity: 0.55`: FOUND
- [x] `src/components/initials-avatar.tsx` exports named `InitialsAvatar`: FOUND
- [x] `src/components/initials-avatar.tsx` imports from `@/lib/hash`: FOUND
- [x] `src/components/cask-card.tsx` exports named `CaskCard`: FOUND
- [x] `src/components/cask-card.tsx` contains `-webkit-line-clamp` (WebkitLineClamp): FOUND
- [x] `src/components/cask-card.tsx` branches on `cask.icon_is_fallback`: FOUND
- [x] `src/components/cask-card.tsx` contains `↓` and `/ yr`: FOUND
- [x] `src/components/cask-grid.tsx` exports named `CaskGrid`: FOUND
- [x] `src/components/cask-grid.tsx` contains `repeat(auto-fill, minmax(460px, 1fr))`: FOUND
- [x] `src/components/cask-grid.tsx` contains `gap: '12px'`: FOUND
- [x] `src/components/cask-grid.tsx` contains "No casks available": FOUND
- [x] `src/components/pagination.tsx` exports named `Pagination`: FOUND
- [x] `src/components/pagination.tsx` contains `← Prev` and `Next →`: FOUND
- [x] `src/components/pagination.tsx` contains `var(--color-primary-dim)`: FOUND
- [x] `src/components/pagination.tsx` contains `Page ` and ` of `: FOUND
- [x] `src/app/browse/page.tsx` contains `await searchParams`: FOUND
- [x] `src/app/browse/page.tsx` contains `Math.max(1,`: FOUND
- [x] `src/app/browse/page.tsx` contains `Promise.all`: FOUND
- [x] `src/app/browse/page.tsx` does NOT contain `force-static`: CONFIRMED
- [x] `src/app/layout.tsx` imports Header and renders `<Header`: FOUND
- [x] `src/app/layout.tsx` contains `getCasksCount`: FOUND
- [x] `npx tsc --noEmit` exits 0: PASSED
- [x] `npm run build` exits 0: PASSED
- [x] Commit 4b5eaa9 (Task 1): FOUND
- [x] Commit ad3e85e (Task 2): FOUND
