---
phase: 04-discovery-layer
plan: 03
subsystem: ui
tags: [react, nextjs, lucide-react, github, components, server-component, conditional-render]

# Dependency graph
requires:
  - phase: 04-discovery-layer
    plan: 01
    provides: "CaskSelectRow type with github_stars/forks/issues/github_enriched columns"
  - phase: 02-catalog-ui
    provides: "CaskCard component, metadata strip pattern, pill badge styling"
  - phase: 01-data-pipeline
    provides: "github_enriched boolean flag, github_stars/forks/issues integer columns"
provides:
  - GitHubStatsCard server component for detail page GitHub stats display
  - StarBadge pure component for star count pill on browse cards
  - Conditional GitHub stats rendering on both detail and browse pages
affects: [05-deployment]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Server component with conditional null return (no 'use client' needed for display-only)"
    - "StarBadge as pure component — no hooks, no router, just props → JSX"
    - "github_enriched && github_stars !== null double-guard before rendering GitHub UI"

key-files:
  created:
    - src/components/github-stats-card.tsx
    - src/components/star-badge.tsx
  modified:
    - src/app/cask/[token]/page.tsx
    - src/components/cask-card.tsx

key-decisions:
  - "GitHubStatsCard returns null early if !github_enriched OR github_stars === null — prevents showing empty/zero stats for non-GitHub casks (D-12)"
  - "StarBadge uses ★ unicode character (not lucide Star icon) for compactness in metadata strip"
  - "Star icon size 20px (primary accent #9581ff) for emphasis; forks/issues icons size 16px (muted) for visual hierarchy"
  - "scripts/categorize-casks.ts pre-commit staged by hook — pre-existing untracked file, not introduced by this plan"

patterns-established:
  - "Server component conditional null: if (!cask.github_enriched || cask.github_stars === null) return null"
  - "Pill badge with primary accent: rgba(124,106,255,0.15) background, rgba(124,106,255,0.25) border, #9581ff text"
  - "Stat separator div: width 1px, height 32px, background var(--color-border-subtle)"

requirements-completed: [DETL-05]

# Metrics
duration: 3min
completed: 2026-05-26
---

# Phase 04 Plan 03: GitHub Stats UI Components Summary

**GitHubStatsCard server component and StarBadge pill component wired into detail pages and browse cards, with double-guard conditional rendering based on github_enriched and github_stars**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-26T08:36:10Z
- **Completed:** 2026-05-26T08:39:11Z
- **Tasks:** 2
- **Files modified:** 4 (plus 2 created)

## Accomplishments
- `GitHubStatsCard`: server component rendering stars/forks/open issues with lucide icons, horizontal stat row with separators, section heading "REPOSITORY STATS", returns null if no GitHub data
- `StarBadge`: pure pill component with "★ {count}" using formatInstallCount, matching install count badge styling
- Detail page (`cask/[token]/page.tsx`) renders `<GitHubStatsCard cask={c} />` after install command section — self-conditionally renders null for non-GitHub casks
- `CaskCard` renders `<StarBadge count={cask.github_stars} />` in metadata strip after installs pill, conditional on `github_enriched && github_stars !== null`

## Task Commits

Each task was committed atomically:

1. **Task 1: Create GitHubStatsCard and StarBadge components** - `651cd8b` (feat)
2. **Task 2: Wire GitHub stats into detail page and browse cards** - `3d1b16e` (feat)

**Plan metadata:** *(docs commit follows)*

## Files Created/Modified
- `src/components/github-stats-card.tsx` — Server component; 133 lines; returns null if !github_enriched; Stars (20px, #9581ff) + Forks (16px, muted) + Issues (16px, muted) with separators
- `src/components/star-badge.tsx` — Pure component; 20 lines; pill "★ {count}" with primary accent styling
- `src/app/cask/[token]/page.tsx` — Added GitHubStatsCard import; `<GitHubStatsCard cask={c} />` inserted between Install section and Stats+Metadata row
- `src/components/cask-card.tsx` — Added StarBadge import; conditional `{cask.github_enriched && cask.github_stars !== null && <StarBadge count={cask.github_stars} />}` after installs pill

## Decisions Made
- **D-12 enforced at component boundary**: GitHubStatsCard returns null (not a skeleton/placeholder) if `!github_enriched || github_stars === null`. No "N/A" display.
- **Star icon visual hierarchy**: Stars at 20px with accent color `#9581ff` signals primary metric; forks and issues at 16px with `var(--color-text-muted)` for secondary context.
- **StarBadge uses ★ unicode** (not lucide Star icon) for compactness in the metadata strip — consistent with UI-SPEC.md § Star Badge copy.

## Deviations from Plan

None — plan executed exactly as written.

*Note: `scripts/categorize-casks.ts` appeared in the Task 2 commit because a pre-commit hook staged it from its untracked state. This is a pre-existing script file from Phase 04-02 work, not introduced by this plan. It has a TypeScript error at line 224 (pre-existing, unrelated to these components).*

## Issues Encountered
- `scripts/categorize-casks.ts` (untracked pre-existing file) introduced a TypeScript error `TS2554: Expected 2 arguments, but got 1` at line 224. This is out-of-scope for this plan (pre-existing file, not modified by any task in this plan). The error does not affect any production source files or build output for the app.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- GitHub stats UI complete — detail pages will show REPOSITORY STATS card for GitHub-enriched casks
- Browse cards will show ★ star count badge for GitHub-enriched casks
- Both components handle missing data gracefully (null return / no render)
- Phase 04 all plans complete; ready for phase verification and Phase 05 deployment

---
*Phase: 04-discovery-layer*
*Completed: 2026-05-26*

## Self-Check

**Checking files exist:**
- src/components/github-stats-card.tsx — FOUND
- src/components/star-badge.tsx — FOUND
- src/app/cask/[token]/page.tsx — FOUND (modified)
- src/components/cask-card.tsx — FOUND (modified)

**Checking commits exist:**
- 651cd8b — feat(04-03): create GitHubStatsCard and StarBadge components
- 3d1b16e — feat(04-03): wire GitHub stats into detail page and browse cards

**Verification results:**
- github-stats-card.tsx has `github_enriched` guard: PASS
- github-stats-card.tsx has `formatInstallCount`: PASS (4 occurrences)
- github-stats-card.tsx has "REPOSITORY STATS": PASS
- star-badge.tsx has `★` character: PASS
- star-badge.tsx has `formatInstallCount`: PASS
- detail page imports and renders GitHubStatsCard: PASS
- cask-card.tsx conditional StarBadge render: PASS
- TypeScript errors in plan files: NONE

## Self-Check: PASSED
