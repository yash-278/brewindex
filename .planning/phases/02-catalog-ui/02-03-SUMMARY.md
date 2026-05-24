---
phase: 02-catalog-ui
plan: "03"
subsystem: detail-ui
tags: [detail-page, copy-button, isr, generateStaticParams, not-found, next-image, server-components, client-component]
dependency_graph:
  requires:
    - 02-01 (getCaskByToken, getTop500Tokens, formatInstallCount, DARK_BLUR_DATA_URL)
    - 02-02 (InitialsAvatar component)
  provides:
    - CopyButton client island (idle/copied/failed states, 2s reset, clipboard API)
    - CaskPage detail page (/cask/[token]) with hero/install/stats/metadata sections
    - generateStaticParams pre-rendering top 500 casks at build time
    - generateMetadata for per-cask page titles
    - NotFound page for invalid cask tokens
  affects:
    - Phase 3 (search) — detail page is the destination for all search results
    - Phase 4 (GitHub enrichment) — detail page hero links row ready for GitHub link addition

tech_stack:
  added: []
  patterns:
    - "'use client' as first line of file — client component boundary convention"
    - "useState<'idle' | 'copied' | 'failed'> union type for button state machine"
    - "navigator.clipboard.writeText in async try/catch with setTimeout reset"
    - "generateStaticParams + dynamicParams true (default) for hybrid ISR"
    - "await params per Next.js 15+ Promise<{token}> requirement"
    - "notFound() called for unknown tokens (no 500 error surface)"
    - "Local helper functions (formatRelativeDate, getDomain) inside page file — not exported"
    - "CaskSelectRow type narrowing after notFound() guard"

key_files:
  created:
    - src/components/copy-button.tsx
    - src/app/cask/[token]/page.tsx
    - src/app/cask/[token]/not-found.tsx

key_decisions:
  - "CopyButton uses inline style objects (same pattern as all Phase 2 components) — no Tailwind classes"
  - "formatRelativeDate and getDomain implemented as local file-scope helpers (not exported to lib/) — detail-page-specific logic with no reuse anticipated"
  - "preload (not priority) on hero Image — Next.js 16 deprecated priority per PATTERNS.md note"
  - "notFound() used (not redirect) for unknown tokens — correct HTTP 404 semantics"

patterns-established:
  - "Client islands: 'use client' as first line before all imports, named export, useState for transient UI state"
  - "Detail page ISR: generateStaticParams returns top-N tokens, dynamicParams default (true) handles the rest via on-demand ISR"

requirements-completed: [DETL-01, DETL-02, DETL-03, DETL-04]

duration: ~12min
completed: 2026-05-24
---

# Phase 02 Plan 03: Cask Detail Page Summary

**CopyButton client island + ISR detail page with 80px hero, install block, three stat cards, metadata table, and not-found state — all wired to real DB data.**

## Performance

- **Duration:** ~12 minutes
- **Started:** 2026-05-24T14:14:52Z
- **Completed:** 2026-05-24T14:26:00Z
- **Tasks:** 2
- **Files modified:** 3 created

## Accomplishments

- CopyButton client island with three-state machine (idle/copied/failed), navigator.clipboard, 2s auto-reset, and min-width 80px to prevent layout shift
- Full detail page at /cask/[token]: 80px icon/avatar, 2rem hero name with -0.03em tracking, version + relative date line, full description, homepage link-btn, install command block with accent token color and CopyButton, three stat cards (30d accent #9581ff, 90d/365d default text), metadata table (Token/Version/Updated/Homepage)
- generateStaticParams pre-renders top 500 casks at build time; remaining casks use on-demand ISR (dynamicParams = true by default)
- not-found.tsx with PackageX icon, "Cask not found" heading, and "Browse all casks" accent pill CTA

## Task Commits

1. **Task 1: CopyButton client island** - `df974b6` (feat)
2. **Task 2: Detail page + not-found** - `da10949` (feat)

**Plan metadata:** (docs commit below)

## Files Created/Modified

- `src/components/copy-button.tsx` — Client island, first 'use client' component, idle/copied/failed state machine
- `src/app/cask/[token]/page.tsx` — ISR detail page, generateStaticParams, generateMetadata, hero/install/stats/metadata
- `src/app/cask/[token]/not-found.tsx` — 404 state for unknown cask tokens

## Decisions Made

- `formatRelativeDate` and `getDomain` implemented as local file-scope helpers rather than adding to `src/lib/` — these are detail-page-specific and have no anticipated reuse in other components
- Used `preload` prop (not `priority`) on the hero Image per PATTERNS.md note that Next.js 16 deprecated `priority`
- `notFound()` called immediately after null check — produces correct HTTP 404 with Next.js error boundary cascade to not-found.tsx
- CopyButton uses inline styles consistent with all Phase 2 components (avoids Tailwind v4 arbitrary value edge cases with CSS vars)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None. TypeScript check passed clean, build succeeded with generateStaticParams running at build time.

## User Setup Required

None — no external service configuration required.

## Known Stubs

None. All UI components are wired to real data from `getCaskByToken` and `getTop500Tokens`. The detail page renders live DB data including name, version, description, homepage, install counts, and last_synced_at timestamp.

## Threat Flags

No new security surface beyond plan threat model:

| Flag | File | Description |
|------|------|-------------|
| (mitigated) T-02-08 | src/app/cask/[token]/page.tsx | [token] param used as DB lookup key — Drizzle parameterizes query, notFound() for unknown tokens |
| (mitigated) T-02-09 | src/app/cask/[token]/page.tsx | homepage URL from DB rendered in anchor href — getDomain wraps in try/catch, rel="noopener noreferrer" + target="_blank" on all external links |

## Next Phase Readiness

- Detail page complete — clicking any CaskCard in /browse now navigates to a full detail page
- Phase 2 success criteria 3, 4, 5 all satisfied: top-500 pre-rendered, CopyButton works, unknown tokens show not-found
- Phase 3 (search) can route search result clicks to /cask/[token] using the same URL pattern
- Phase 4 (GitHub enrichment) can add a GitHub link-btn in the hero links row (slot already exists, empty when no github data)

---
*Phase: 02-catalog-ui*
*Completed: 2026-05-24*
