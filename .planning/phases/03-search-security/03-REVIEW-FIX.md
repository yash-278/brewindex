---
phase: 03-search-security
fixed_at: 2026-05-25T00:00:00Z
review_path: .planning/phases/03-search-security/03-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-05-25T00:00:00Z
**Source review:** .planning/phases/03-search-security/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (2 Critical + 4 Warning; IN-01 excluded by fix_scope=critical_warning)
- Fixed: 6
- Skipped: 0

## Fixed Issues

### CR-01: `/api/search` has no rate limiting

**Files modified:** `src/app/api/search/route.ts`, `src/lib/search-constants.ts`, `package.json`, `package-lock.json`
**Commit:** 6e3aa0a
**Applied fix:** Installed `@upstash/ratelimit@2.0.8` and `@upstash/redis`. Added a module-level `Ratelimit` instance (sliding window 20 req/10s) and guarded `GET` with a per-IP check at the top of the handler, returning 429 on excess. The QuerySchema min/max values were replaced with named constants imported from the new `src/lib/search-constants.ts` (see WR-04 below — both fixes were applied atomically in the same commit since the route imports the new constants file).

---

### CR-02: `browse/page.tsx` search path bypasses query length validation

**Files modified:** `src/app/browse/page.tsx`
**Commit:** 1af7ee0
**Applied fix:** Replaced the raw `q.trim()` passed to `searchCasks` with `q.trim().slice(0, SEARCH_MAX_LENGTH)` stored in a `trimmed` local variable. The result-count string now renders `trimmed` instead of `q.trim()`, so arbitrarily long crafted URLs cannot reach the database or be reflected in the page output. The magic number `2` was replaced with `SEARCH_MIN_LENGTH` imported from `search-constants.ts`.

---

### WR-01: Debounce timer not cleared on `SearchInput` unmount

**Files modified:** `src/components/search-input.tsx`
**Commit:** 4c32dc9
**Applied fix:** Added a second `useEffect` with an empty dependency array that returns a cleanup function calling `clearTimeout(timerRef.current)`. This ensures any pending 300ms debounce is cancelled when the component unmounts, preventing spurious `router.replace` calls after navigation. Also replaced the local `MIN_QUERY_LENGTH = 2` constant with `SEARCH_MIN_LENGTH` from `search-constants.ts` (WR-04 combined in same commit).

---

### WR-02: Homepage anchor renders `href="#"` when `safeHomepage` is null

**Files modified:** `src/app/cask/[token]/page.tsx`
**Commit:** 8cd9682
**Applied fix:** Replaced the unconditional `<a href={safeHomepage ?? '#'}>` in the details metadata block with a conditional render: when `safeHomepage` is a valid string the anchor is rendered; otherwise the plain text `'—'` is shown. This matches the pattern already used correctly in the hero links row (lines 164-181) and eliminates the non-functional clickable link.

---

### WR-03: Vercel cron schedule missing from `vercel.json`

**Files modified:** `vercel.json`
**Commit:** 7db322e
**Applied fix:** Added a `crons` array to `vercel.json` with a single entry pointing to `/api/cron/sync` on schedule `0 */6 * * *` (every 6 hours), matching the CLAUDE.md recommended schedule. Without this entry Vercel never invokes the sync route and the cask catalog would never be refreshed in production.

---

### WR-04: Minimum query length constant is duplicated, not shared

**Files modified:** `src/lib/search-constants.ts` (new file), `src/app/api/search/route.ts`, `src/components/search-input.tsx`, `src/app/browse/page.tsx`
**Commits:** 6e3aa0a (constants file + route), 4c32dc9 (search-input), 1af7ee0 (browse page)
**Applied fix:** Created `src/lib/search-constants.ts` exporting `SEARCH_MIN_LENGTH = 2` and `SEARCH_MAX_LENGTH = 100`. All three consumer files now import from this single source of truth. The local `MIN_QUERY_LENGTH` constant in `search-input.tsx` and the hardcoded `z.string().min(2).max(100)` in the API route are both replaced. WR-04 was implemented across the same commits as CR-01, CR-02, and WR-01 since it was a dependency of those fixes.

---

_Fixed: 2026-05-25T00:00:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
