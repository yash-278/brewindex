---
phase: 02-catalog-ui
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - components.json
  - next.config.ts
  - src/app/globals.css
  - src/app/layout.tsx
  - src/app/page.tsx
  - src/app/browse/page.tsx
  - src/app/cask/[token]/page.tsx
  - src/app/cask/[token]/not-found.tsx
  - src/components/copy-button.tsx
  - src/components/cask-card.tsx
  - src/components/cask-grid.tsx
  - src/components/header.tsx
  - src/components/initials-avatar.tsx
  - src/components/pagination.tsx
  - src/components/ui/button.tsx
  - src/components/ui/card.tsx
  - src/components/ui/separator.tsx
  - src/components/ui/skeleton.tsx
  - src/lib/blur-data-url.ts
  - src/lib/format.ts
  - src/lib/hash.ts
  - src/lib/queries.ts
  - src/lib/utils.ts
findings:
  critical: 1
  warning: 3
  info: 4
  total: 8
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-24
**Depth:** standard
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Review covers the full catalog UI implementation: browse grid, cask detail page, shared components (header, pagination, card, copy button, initials avatar), utility libraries, and scaffolded shadcn/ui primitives. The overall implementation is clean and the ISR/caching strategy is correctly applied. One crash-path in `getInitials()` was found, the copy button has a timer accumulation bug that causes premature state resets, and the entire site has no error boundary to absorb DB failures. The scaffolded shadcn/ui primitives (`Button`, `Card`, `Separator`, `Skeleton`) are fully unused.

---

## Critical Issues

### CR-01: `getInitials()` panics on empty-string or single-dash tokens

**File:** `src/lib/hash.ts:42`
**Issue:** When `token` is `""` (empty string) or `"-"` (only dashes), `token.split('-').filter(Boolean)` returns an empty array. The function then falls into the `parts.length === 1` branch check, but `parts.length === 0` skips it and reaches `parts[0][0]` — accessing index `0` on `undefined`, throwing `TypeError: Cannot read properties of undefined (reading '0')`. This propagates as an unhandled server render crash on any cask whose token somehow becomes empty. Confirmed by runtime test:

```
getInitials('')  -> TypeError: Cannot read properties of undefined (reading '0')
getInitials('-') -> same crash
```

Homebrew tokens are normally well-formed, but the function has no defensive guard. A single bad row in the database (or a test fixture) will crash the page for every visitor.

**Fix:**
```typescript
export function getInitials(token: string): string {
  const parts = token.split('-').filter(Boolean);
  if (parts.length === 0) return '?';           // guard: empty/dash-only token
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```

---

## Warnings

### WR-01: `CopyButton` accumulates `setTimeout` handles on rapid clicks

**File:** `src/components/copy-button.tsx:12-15`
**Issue:** Each call to `handleCopy` schedules a new `setTimeout(() => setState('idle'), 2000)` without cancelling any previously scheduled timer. If the user clicks twice within 2 seconds, the first timer fires mid-way through the second "copied" display, flipping state back to `idle` prematurely — the button flickers or shows `idle` while the user expects to still see "Copied!". The fix is to hold the timer in a `useRef` and clear it on each new click.

**Fix:**
```typescript
'use client';
import { useState, useRef } from 'react';

export function CopyButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleCopy() {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText('brew install --cask ' + token);
      setState('copied');
    } catch {
      setState('failed');
    }
    timerRef.current = setTimeout(() => setState('idle'), 2000);
  }
  // ...rest unchanged
}
```

### WR-02: No error boundary — DB failure crashes the entire site

**File:** `src/app/layout.tsx:27`
**Issue:** `getCasksCount()` is called directly inside the async `RootLayout` with no try/catch and no Next.js `error.tsx` boundary anywhere in `src/app/`. If the Neon database is cold-starting, network-unreachable, or over quota, every single page render throws, and users receive a Next.js 500 error page rather than a degraded-but-functional UI. The header cask count is cosmetic — it should not be able to take down the site.

**Fix:** Add `src/app/error.tsx` for a top-level error boundary, and defensively fall back to `0` in the layout:

```typescript
// src/app/layout.tsx
let caskCount = 0;
try {
  caskCount = await getCasksCount();
} catch {
  // DB unavailable — render header without count
}
```

And create `src/app/error.tsx`:
```typescript
'use client';
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p>Something went wrong. <button onClick={reset}>Try again</button></p>
    </main>
  );
}
```

### WR-03: Magic number `48` (page size) duplicated without a shared constant

**File:** `src/lib/queries.ts:9,15` and `src/app/browse/page.tsx:19`
**Issue:** The page size `48` is written three times in two different files: twice in `queries.ts` (offset calculation and `.limit()`) and once in `browse/page.tsx` (total pages calculation). These three values must always stay in sync. If someone changes the `.limit()` in the query but misses the `totalPages` calculation, pagination breaks silently — pages will be off by a factor.

**Fix:** Define a shared constant and import it in both files:
```typescript
// src/lib/queries.ts (or a dedicated src/lib/constants.ts)
export const PAGE_SIZE = 48;

// queries.ts
const offset = (page - 1) * PAGE_SIZE;
return db. ... .limit(PAGE_SIZE).offset(offset);

// browse/page.tsx
import { PAGE_SIZE } from '@/lib/queries';
const totalPages = Math.ceil(totalCount / PAGE_SIZE);
```

---

## Info

### IN-01: Version display renders `v—` when version is null

**File:** `src/app/cask/[token]/page.tsx:121`
**Issue:** The expression `` v{c.version ?? '—'} `` renders the literal string `v—` when `c.version` is `null`. This is incorrect typography — the intended fallback should omit the `v` prefix entirely when there is no version.

**Fix:**
```tsx
{c.version ? `v${c.version}` : '—'} · Last updated {formatRelativeDate(c.last_synced_at)}
```

### IN-02: Scaffolded shadcn/ui components are dead code

**Files:** `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/skeleton.tsx`
**Issue:** None of the four generated shadcn/ui primitives are imported anywhere in the codebase (confirmed by grep). They add ~150 lines of dead code and two undocumented runtime dependencies (`@base-ui/react/button`, `@base-ui/react/separator`). Components should be committed only when they are first used.

**Fix:** Delete the four files until they are needed, or at minimum add a note that these are reserved scaffolding.

### IN-03: `<button>` in `CopyButton` is missing `type="button"`

**File:** `src/components/copy-button.tsx:30`
**Issue:** HTML `<button>` elements default to `type="submit"` when inside a `<form>`. The `CopyButton` is currently not inside a form, but the omission is a latent defect — if the install section is ever wrapped in a form (e.g., for a download/analytics form), the button would submit it instead of copying.

**Fix:**
```tsx
<button type="button" onClick={handleCopy} ...>
```

### IN-04: Pagination and header search have no ARIA landmarks or labels

**Files:** `src/components/pagination.tsx:65`, `src/components/header.tsx:42`
**Issue:** The pagination `<div>` container is not a `<nav>` element and has no `aria-label`, making it invisible to screen readers as a navigation region. The disabled search `<input>` has no `<label>` element or `aria-label` attribute.

**Fix:**
```tsx
// pagination.tsx — wrap outer div
<nav aria-label="Page navigation">
  ...
</nav>

// header.tsx — add aria-label to input
<input aria-label="Search casks" type="text" ... />
```

---

_Reviewed: 2026-05-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
