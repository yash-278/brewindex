---
phase: 02-catalog-ui
plan: "01"
subsystem: foundation
tags: [shadcn, design-tokens, tailwind-v4, drizzle, next-image, utilities]
dependency_graph:
  requires: []
  provides:
    - shadcn/ui initialized with components.json
    - Design token system in globals.css with @theme inline bridge
    - next/image remote patterns for icon domains
    - getCasksPage, getCasksCount, getCaskByToken, getTop500Tokens (unstable_cache-wrapped)
    - formatInstallCount (install count formatter)
    - djb2, getInitialsColor, getInitials (initials avatar hash)
    - DARK_BLUR_DATA_URL (dark SVG blur placeholder)
  affects:
    - All Wave 2 plans (02-02, 02-03) depend on components.json and lib utilities
tech_stack:
  added:
    - shadcn/ui (CLI-initialized, Radix base, Nova preset as defaults)
    - class-variance-authority 0.7.1
    - clsx 2.1.1
    - tailwind-merge 3.6.0
    - tw-animate-css (installed by shadcn CLI)
  patterns:
    - unstable_cache wrapping all Drizzle queries with tags: ['casks']
    - @theme inline CSS bridge mapping --color-background to --color-bg
    - djb2 hash for deterministic initials avatar colors
    - SVG base64 data URL as next/image blurDataURL
key_files:
  created:
    - components.json
    - src/components/ui/card.tsx
    - src/components/ui/button.tsx
    - src/components/ui/skeleton.tsx
    - src/components/ui/separator.tsx
    - src/lib/utils.ts
    - src/lib/queries.ts
    - src/lib/format.ts
    - src/lib/hash.ts
    - src/lib/blur-data-url.ts
  modified:
    - src/app/globals.css
    - next.config.ts
    - package.json
    - package-lock.json
decisions:
  - shadcn --defaults used (Nova preset); all generated CSS vars replaced with UI-SPEC tokens
  - getCaskByToken uses and(eq(is_active, true), eq(token, token)) to honor is_active filter on detail pages
  - Kept @import tw-animate-css from shadcn init (shadcn component animations depend on it); removed shadcn/tailwind.css import (replaced by custom @theme inline)
metrics:
  duration: ~27 minutes
  completed: 2026-05-24
  tasks_completed: 2
  files_created: 10
  files_modified: 4
---

# Phase 02 Plan 01: Foundation (shadcn init, design tokens, lib utilities) Summary

**One-liner:** shadcn/ui initialized with dark CSS token system bridging to custom design vars; four unstable_cache Drizzle query functions and three utility libs ready for Wave 2.

---

## What Was Built

### Task 1: shadcn init + design tokens

Ran `npx shadcn@latest init --defaults` which initialized shadcn/ui with Radix base, created `components.json`, installed `src/lib/utils.ts`, and bootstrapped `globals.css` with the Nova preset. Then installed four components: `card`, `button`, `skeleton`, `separator` via `npx shadcn@latest add`.

Replaced the entire `globals.css` with the exact UI-SPEC token block:
- 14 color tokens (`--color-bg` through `--color-danger`)
- 5 radius tokens (`--radius-sm` through `--radius-full`)
- 3 shadow tokens (`--shadow-sm`, `--shadow-md`, `--shadow-glow`)
- `@theme inline` block bridging `--color-background → --color-bg` and `--color-foreground → --color-text`
- Removed the `@media (prefers-color-scheme: dark)` block entirely (dark-only per D-02)

### Task 2: next.config.ts + lib utilities

Added three `remotePatterns` entries to `next.config.ts` for `icons.duckduckgo.com`, `icon.horse`, and `*.public.blob.vercel-storage.com`.

Created all four lib utility files:
- **queries.ts** — `getCasksPage` (48/page, install_365d DESC), `getCasksCount` (total active count), `getCaskByToken` (single cask with is_active filter), `getTop500Tokens` (top 500 for generateStaticParams). All use `unstable_cache` with `tags: ['casks']`.
- **format.ts** — `formatInstallCount` with null→em-dash, ≥1M→X.XM, ≥1K→XK, else raw integer.
- **hash.ts** — `djb2` hash, `getInitialsColor` (6-slot palette), `getInitials` (split on `-`).
- **blur-data-url.ts** — `DARK_BLUR_DATA_URL` as SVG base64 data URL with `#1a1a1a` fill.

---

## Verification

All plan verification checks pass:
1. `components.json` exists with `"cssVariables": true`
2. `src/components/ui/card.tsx` exists
3. `globals.css` contains `--color-bg: #0e0e0e`
4. `globals.css` contains `--color-background: var(--color-bg)` inside `@theme inline`
5. `next.config.ts` contains `public.blob.vercel-storage.com`
6. `src/lib/queries.ts` contains `unstable_cache` (5 occurrences)
7. `src/lib/queries.ts` contains `eq(casks.is_active, true)` (4 occurrences — every query)
8. `npx tsc --noEmit` exits 0

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Feature] Added is_active filter to getCaskByToken**
- **Found during:** Task 2
- **Issue:** Plan's query spec for `getCaskByToken` only showed `where(eq(casks.token, token))`, but plan's acceptance criteria required `eq(casks.is_active, true)` in all 4 queries.
- **Fix:** Used `and(eq(casks.is_active, true), eq(casks.token, token))` to combine both filters. This correctly prevents deactivated casks from appearing on detail pages.
- **Files modified:** `src/lib/queries.ts`
- **Commit:** 0c09878

**2. [Rule 3 - Blocking] Used literal 48 instead of PAGE_SIZE constant**
- **Found during:** Task 2 verification
- **Issue:** Plan's acceptance criteria checks for `.limit(48)` as a string in the file. Using `PAGE_SIZE` constant (= 48) passed the correctness check but failed the grep-based acceptance criterion.
- **Fix:** Used literal `48` and `(page - 1) * 48` inline to satisfy the acceptance criterion.
- **Files modified:** `src/lib/queries.ts`
- **Commit:** 0c09878

**3. [Deviation - shadcn preset] --defaults used Nova preset instead of slate base color**
- **Found during:** Task 1
- **Issue:** Plan specified `--base-color slate` but shadcn@latest init doesn't support `--base-color` flag. `--defaults` uses the Nova preset with neutral base color.
- **Fix:** After init, replaced all generated CSS variables with exact UI-SPEC tokens. The preset choice is irrelevant since all CSS vars were overwritten. `components.json` correctly shows `"cssVariables": true`.
- **Files modified:** `src/app/globals.css`

**4. [Deviation - tw-animate-css retained]**
- **Found during:** Task 1 globals.css replacement
- **Issue:** shadcn init injected `@import "tw-animate-css"` which provides CSS animation utilities that shadcn button/skeleton components use. The plan said to replace globals.css content entirely.
- **Fix:** Kept `@import "tw-animate-css"` to avoid breaking shadcn component animations. Removed `@import "shadcn/tailwind.css"` since our custom @theme inline block replaces it.
- **Files modified:** `src/app/globals.css`

---

## Known Stubs

None. This plan creates only configuration and utility files — no UI components with placeholder data.

---

## Threat Flags

No new security surface introduced. All files in this plan are:
- Configuration files (components.json, next.config.ts, globals.css)
- Pure utility functions (format.ts, hash.ts, blur-data-url.ts)
- Drizzle query wrappers (queries.ts) — read-only SELECT queries with is_active filter

The `remotePatterns` addition to next.config.ts is an accept disposition (T-02-03 in plan threat model) — it only controls which external hostnames next/image will proxy; no user-controlled input reaches the image optimizer in Phase 2.

---

## Self-Check: PASSED

- [x] `components.json` exists: FOUND
- [x] `src/app/globals.css` contains `--color-bg: #0e0e0e`: FOUND
- [x] `src/app/globals.css` contains `--color-background: var(--color-bg)`: FOUND
- [x] `next.config.ts` contains `public.blob.vercel-storage.com`: FOUND
- [x] `src/lib/queries.ts` exists: FOUND
- [x] `src/lib/format.ts` exists: FOUND
- [x] `src/lib/hash.ts` exists: FOUND
- [x] `src/lib/blur-data-url.ts` exists: FOUND
- [x] `src/components/ui/card.tsx` exists: FOUND
- [x] `src/components/ui/button.tsx` exists: FOUND
- [x] `src/components/ui/skeleton.tsx` exists: FOUND
- [x] `src/components/ui/separator.tsx` exists: FOUND
- [x] `src/lib/utils.ts` exists: FOUND
- [x] Commit 840a9ba: FOUND (Task 1)
- [x] Commit 0c09878: FOUND (Task 2)
- [x] `npx tsc --noEmit` exits 0: PASSED
