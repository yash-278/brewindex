---
phase: 02-catalog-ui
reviewed: 2026-05-24T00:00:00Z
depth: standard
files_reviewed: 21
files_reviewed_list:
  - src/components/ui/card.tsx
  - src/components/ui/button.tsx
  - src/components/ui/skeleton.tsx
  - src/components/ui/separator.tsx
  - src/lib/utils.ts
  - src/lib/queries.ts
  - src/lib/format.ts
  - src/lib/hash.ts
  - src/lib/blur-data-url.ts
  - src/app/globals.css
  - src/app/browse/page.tsx
  - src/components/header.tsx
  - src/components/cask-card.tsx
  - src/components/cask-grid.tsx
  - src/components/initials-avatar.tsx
  - src/components/pagination.tsx
  - src/app/page.tsx
  - src/app/layout.tsx
  - src/components/copy-button.tsx
  - src/app/cask/[token]/page.tsx
  - src/app/cask/[token]/not-found.tsx
findings:
  critical: 2
  warning: 5
  info: 4
  total: 11
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-05-24
**Depth:** standard
**Files Reviewed:** 21
**Status:** issues_found

## Summary

Reviewed the full Phase 02 catalog UI: browse grid, cask detail page, shared components, and utility libraries. The ISR/caching strategy is correctly applied — the `unstable_cache` implementation was verified against the Next.js 16 source and confirmed to include runtime args in the cache key (no collision). The server/client component split is correct and the Drizzle + Neon stack is properly used.

Two critical issues were found: an XSS vulnerability from unvalidated external URLs rendered as anchor `href` values, and a runtime crash in `getInitials()` for malformed tokens. Five warnings address a timer accumulation bug in `CopyButton`, a missing site-wide error boundary, a defensive-access gap in `getCasksCount`, a `Buffer` Node.js-only call in module-level code, and a duplicated magic number. Four info items cover `v—` display bug, dead shadcn/ui code, missing `type="button"`, and accessibility gaps.

---

## Critical Issues

### CR-01: Unvalidated external URL rendered as raw anchor `href` — XSS on click

**File:** `src/app/cask/[token]/page.tsx:429`

**Issue:** The "Homepage" metadata row renders `c.homepage` directly as the `href` of a raw `<a>` tag with no URL-scheme validation:

```tsx
href={c.homepage ?? '#'}
```

If the database contains a `javascript:` URL — possible via a compromised upstream Homebrew API feed, a rogue cask submission, or a future sync bug — any user clicking the "Homepage" link executes arbitrary JavaScript in their browser. `javascript:` links are not blocked by `rel="noopener noreferrer"`.

React 19 emits a development-mode warning for `javascript:` URLs but does **not** sanitize them from SSR output. The server renders the raw string into the HTML source; browsers execute `javascript:` hrefs on click regardless of how they arrived in the page. This is a stored XSS vector.

The hero-section link at line 140 (`href={c.homepage!}`) is guarded by `domain &&` — but `getDomain('javascript:alert(1)')` returns the non-empty string `'javascript'`, so `domain` is truthy and that link is also rendered. Both anchors are vulnerable.

**Fix:** Add a helper that accepts only `http:` and `https:` schemes and use it everywhere `c.homepage` is used as an `href`:

```typescript
// src/lib/utils.ts (or src/lib/format.ts)
export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}
```

Then in `cask/[token]/page.tsx`:

```tsx
// Compute once, use everywhere
const safeHomepage = safeExternalUrl(c.homepage);
const domain = getDomain(safeHomepage);

// Line 138-155 — hero links row
{domain && (
  <a href={safeHomepage!} target="_blank" rel="noopener noreferrer" ...>
    ↗ {domain}
  </a>
)}

// Line 427-436 — metadata row
<a
  href={safeHomepage ?? '#'}
  target="_blank"
  rel="noopener noreferrer"
  ...
>
  {domain || safeHomepage || '—'}
</a>
```

---

### CR-02: `getInitials()` throws `TypeError` on empty or all-dash tokens

**File:** `src/lib/hash.ts:43`

**Issue:** `token.split('-').filter(Boolean)` returns an empty array when `token` is `''` or consists only of dashes (e.g., `'---'`). With an empty `parts` array, `parts.length === 1` is false, execution reaches `parts[0][0]`, and `parts[0]` is `undefined` — throwing `TypeError: Cannot read properties of undefined (reading '0')`. Confirmed by runtime test:

```
getInitials('')    // TypeError
getInitials('---') // TypeError
```

This crash propagates through `InitialsAvatar` and produces a 500 error for the entire cask card or detail page. Homebrew tokens are normally well-formed, but the DB schema (`text().notNull()`) does not enforce minimum length or character restrictions. A single bad row, a test fixture, or seeded mock data with an empty token crashes every page that renders it.

**Fix:**
```typescript
export function getInitials(token: string): string {
  const parts = token.split('-').filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
```

---

## Warnings

### WR-01: `CopyButton` accumulates `setTimeout` handles on rapid clicks

**File:** `src/components/copy-button.tsx:12,15`

**Issue:** Each invocation of `handleCopy` schedules `setTimeout(() => setState('idle'), 2000)` without cancelling any previously scheduled timer. If the user clicks twice within 2 seconds, the first timer fires mid-display of the second action, flipping state back to `idle` prematurely — the button flickers or shows `idle` while the user expects "Copied!" to still be visible.

Additionally the timeouts are never cleared on unmount, so if navigation away from the detail page happens within the 2-second window, the callback fires and calls `setState` on an unmounted component (produces a warning in React 19 Strict Mode).

**Fix:**
```typescript
'use client';
import { useState, useRef, useEffect } from 'react';

export function CopyButton({ token }: { token: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

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

---

### WR-02: No error boundary — a DB failure crashes the entire site

**File:** `src/app/layout.tsx:27`

**Issue:** `getCasksCount()` is called inside the async `RootLayout` with no try/catch and no `error.tsx` boundary anywhere in `src/app/`. If Neon is cold-starting, network-unreachable, or over its free-tier quota, every page render throws — users see a Next.js 500 error page instead of a degraded-but-functional UI. The header cask count is cosmetic and should not take down all pages.

**Fix:** Wrap the count fetch defensively and add a top-level error boundary:

```typescript
// src/app/layout.tsx
let caskCount = 0;
try {
  caskCount = await getCasksCount();
} catch {
  // DB unavailable; render without count rather than crashing
}
```

```typescript
// src/app/error.tsx  (new file)
'use client';
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main style={{ padding: '48px 24px', textAlign: 'center' }}>
      <p style={{ color: 'var(--color-text-muted)' }}>
        Something went wrong.{' '}
        <button onClick={reset} style={{ color: 'var(--color-primary-hover)', cursor: 'pointer' }}>
          Try again
        </button>
      </p>
    </main>
  );
}
```

---

### WR-03: `getCasksCount()` accesses `result[0]` without a null guard

**File:** `src/lib/queries.ts:29`

**Issue:** `result[0].count` is accessed unconditionally. `COUNT(*)` in Postgres always returns exactly one row so this holds in normal operation. However, if the Neon HTTP driver returns a malformed payload (e.g., due to a cold-start race, a driver version mismatch, or an unexpected empty response), `result` could be an empty array and `result[0].count` throws `TypeError: Cannot read properties of undefined (reading 'count')`. Because `getCasksCount()` is used in the root layout (see WR-02), this single unchecked access can take down all pages.

**Fix:**
```typescript
return result[0]?.count ?? 0;
```

---

### WR-04: `Buffer` used at module load time — Node.js-only, edge runtime incompatible

**File:** `src/lib/blur-data-url.ts:9`

**Issue:** `Buffer.from(svgPlaceholder).toString('base64')` runs when the module is first imported. `Buffer` is a Node.js global; it is not available in the Vercel Edge Runtime. No route currently uses the edge runtime, so this is latent. If any route that imports `blur-data-url.ts` (directly or transitively: `cask-card.tsx`, `cask/[token]/page.tsx`) is later moved to the edge, it will fail at cold start with `Buffer is not defined`.

**Fix:** Replace with a pre-computed static string (the result of the current expression):
```typescript
// Pre-computed: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8">
//   <rect width="8" height="8" fill="#1a1a1a"/></svg>').toString('base64')
export const DARK_BLUR_DATA_URL =
  'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMxYTFhMWEiLz48L3N2Zz4=';
```

---

### WR-05: Magic number `48` (page size) duplicated across two files without a shared constant

**File:** `src/lib/queries.ts:9,15` and `src/app/browse/page.tsx:19`

**Issue:** The page size `48` appears three times: as the `LIMIT` and in the offset calculation in `queries.ts`, and in the `totalPages = Math.ceil(totalCount / 48)` in `browse/page.tsx`. These three values must stay in sync. Changing `.limit()` in the query without updating the browse page calculation produces an off-by-one in page count (e.g., items on the last page silently vary).

**Fix:**
```typescript
// src/lib/queries.ts
export const PAGE_SIZE = 48;

// In getCasksPage:
const offset = (page - 1) * PAGE_SIZE;
return db. ... .limit(PAGE_SIZE).offset(offset);

// src/app/browse/page.tsx
import { getCasksPage, getCasksCount, PAGE_SIZE } from '@/lib/queries';
const totalPages = Math.ceil(totalCount / PAGE_SIZE);
```

---

## Info

### IN-01: Version display renders `v—` when version is null

**File:** `src/app/cask/[token]/page.tsx:121`

**Issue:** `` v{c.version ?? '—'} `` renders `v—` when `c.version` is `null`. The `v` prefix belongs only to actual version strings.

**Fix:**
```tsx
{c.version ? `v${c.version}` : '—'} · Last updated {formatRelativeDate(c.last_synced_at)}
```

---

### IN-02: Scaffolded shadcn/ui primitives are unused dead code

**Files:** `src/components/ui/button.tsx`, `src/components/ui/card.tsx`, `src/components/ui/separator.tsx`, `src/components/ui/skeleton.tsx`

**Issue:** None of the four generated shadcn/ui primitives are imported anywhere in the codebase. They add ~150 lines of untested dead code and two undocumented runtime dependencies (`@base-ui/react/button`, `@base-ui/react/separator`).

**Fix:** Delete the four files until they are needed. If they are reserved for a future phase, add a comment at the top of each file noting the planned use.

---

### IN-03: `<button>` in `CopyButton` is missing `type="button"`

**File:** `src/components/copy-button.tsx:30`

**Issue:** HTML `<button>` elements default to `type="submit"` when inside a `<form>`. The component is not currently inside a form, but omitting `type="button"` is a latent defect: if the install section is ever wrapped in a form, the copy button would submit it.

**Fix:**
```tsx
<button type="button" onClick={handleCopy} ...>
```

---

### IN-04: Pagination and header search have no ARIA landmarks or labels

**Files:** `src/components/pagination.tsx:66`, `src/components/header.tsx:42`

**Issue:** The pagination container is a plain `<div>`, not a `<nav>` element, and carries no `aria-label`. Screen readers cannot identify it as a navigation region. The disabled search `<input>` has no `<label>` or `aria-label` attribute; `placeholder` text is not a reliable accessible label per ARIA spec.

**Fix:**
```tsx
// pagination.tsx — outer wrapper
<nav aria-label="Page navigation">
  ...
</nav>

// header.tsx — search input
<input aria-label="Search casks" type="text" placeholder="Search casks…" disabled ... />
```

---

_Reviewed: 2026-05-24_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
