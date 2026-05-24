---
phase: 02-catalog-ui
fixed_at: 2026-05-24T00:00:00Z
review_path: .planning/phases/02-catalog-ui/02-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 7
skipped: 0
status: all_fixed
---

# Phase 02: Code Review Fix Report

**Fixed at:** 2026-05-24
**Source review:** .planning/phases/02-catalog-ui/02-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 7
- Fixed: 7
- Skipped: 0

## Fixed Issues

### CR-01: Unvalidated external URL rendered as raw anchor `href` — XSS on click

**Files modified:** `src/lib/utils.ts`, `src/app/cask/[token]/page.tsx`
**Commit:** fc76ea5
**Applied fix:** Added `safeExternalUrl()` helper to `src/lib/utils.ts` that accepts only `http:` and `https:` scheme URLs (returns `null` for all others). In `cask/[token]/page.tsx`, imported the helper, computed `safeHomepage = safeExternalUrl(c.homepage)` once, and used it in both the hero-section anchor (`href={safeHomepage}`) and the metadata-section anchor (`href={safeHomepage ?? '#'}`). `getDomain()` now also receives the validated URL, so a `javascript:alert(1)` homepage no longer makes `domain` truthy.

### CR-02: `getInitials()` throws `TypeError` on empty or all-dash tokens

**Files modified:** `src/lib/hash.ts`
**Commit:** fadeece
**Applied fix:** Added `if (parts.length === 0) return '?';` guard before the single-part check. Empty string and all-dash tokens (e.g., `''`, `'---'`) now return `'?'` instead of throwing `TypeError: Cannot read properties of undefined`.

### WR-01: `CopyButton` accumulates `setTimeout` handles on rapid clicks

**Files modified:** `src/components/copy-button.tsx`
**Commit:** 9156ff2
**Applied fix:** Imported `useRef` and `useEffect` alongside `useState`. Added `timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)`. In `handleCopy`, clears the existing timer before scheduling a new one. Added a cleanup `useEffect` that clears the timer on unmount, preventing stale `setState` calls after navigation.

### WR-02: No error boundary — a DB failure crashes the entire site

**Files modified:** `src/app/layout.tsx`, `src/app/error.tsx` (new file)
**Commit:** 7c8819e
**Applied fix:** Wrapped `getCasksCount()` in `layout.tsx` with `let caskCount = 0; try { caskCount = await getCasksCount(); } catch { /* fallback */ }` so DB failures render the header without a count rather than crashing all pages. Created `src/app/error.tsx` as a `'use client'` global error boundary that renders a "Something went wrong. Try again" message with a `reset()` button.

### WR-03: `getCasksCount()` accesses `result[0]` without a null guard

**Files modified:** `src/lib/queries.ts`
**Commit:** ab0dad2
**Applied fix:** Changed `return result[0].count;` to `return result[0]?.count ?? 0;` — optional chaining plus nullish coalesce makes the function safe against a malformed empty response from the Neon HTTP driver.

### WR-04: `Buffer` used at module load time — Node.js-only, edge runtime incompatible

**Files modified:** `src/lib/blur-data-url.ts`
**Commit:** ac73721
**Applied fix:** Replaced the `Buffer.from(svgPlaceholder).toString('base64')` runtime call with the pre-computed literal string `'data:image/svg+xml;base64,PHN2ZyB4bWxucz0i...'`. The base64 value was verified by running the original expression in Node.js — the output matches the REVIEW.md suggestion exactly. The module is now safe in any runtime environment.

### WR-05: Magic number `48` (page size) duplicated across two files

**Files modified:** `src/lib/queries.ts`, `src/app/browse/page.tsx`
**Commit:** ba6cbca
**Applied fix:** Exported `export const PAGE_SIZE = 48;` from `src/lib/queries.ts`. Updated `getCasksPage` to use `PAGE_SIZE` for both the `limit()` call and the offset calculation. Updated `src/app/browse/page.tsx` to import `PAGE_SIZE` and use it in `Math.ceil(totalCount / PAGE_SIZE)`. All three occurrences are now derived from a single constant.

---

_Fixed: 2026-05-24_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
