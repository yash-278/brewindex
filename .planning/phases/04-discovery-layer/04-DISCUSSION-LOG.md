# Phase 4: Discovery Layer - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-26
**Phase:** 4-discovery-layer
**Areas discussed:** Category System, Sort & Filter UI Placement, GitHub Stats Display, GitHub Stats on Cards, Pagination Fixes, Layout Width

---

## Category System

### Question 1: Category Source

| Option | Description | Selected |
|--------|-------------|----------|
| Infer from cask metadata | Analyze description/name text with keyword matching or embeddings to infer categories. Auto-categorizes all casks. May have misclassifications. | |
| Manual mapping file | Create a manual mapping file (e.g., cask-categories.json) with token→category assignments. Precise but requires curation. Unmapped casks go to 'Uncategorized'. | |
| Import from Homebrew data | Check if Homebrew's API or cask JSON includes category/tag fields we can import. Canonical source but may not match our taxonomy. | ✓ |
| Hybrid approach | Hybrid: start with Homebrew tags if available, supplement with keyword inference for unmapped casks, allow manual overrides. | |

**User's choice:** Check if homebrew has something, else, we can do a small model run it locally via AWS Bedrock connection that I have that can categorize it and save it.

**Notes:** User has an AWS Bedrock connection available. Approach: (1) First check Homebrew API for existing category/tag data, (2) If not available, run a one-time ML categorization batch job using a small model via AWS Bedrock, (3) Store results in database as part of data pipeline enrichment.

### Question 2: Category Granularity

| Option | Description | Selected |
|--------|-------------|----------|
| 8-10 broad categories | Developer Tools, Productivity, Design, Media, Games, Utilities, Communication, Education, Other. Matches common App Store taxonomies. | |
| 15-20 specific categories | More granular: Web Browsers, Code Editors, Video Players, Graphic Design, Password Managers, etc. Better discovery but longer filter UI. | |
| Let the model decide | Let Bedrock determine category set organically from the cask descriptions (unsupervised clustering). May surface unexpected but useful groupings. | ✓ |

**User's choice:** Let the model decide

**Notes:** Data-driven approach — let unsupervised clustering determine the natural category groupings rather than imposing a predetermined taxonomy.

---

## Sort & Filter UI Placement

### Question 1: UI Location

| Option | Description | Selected |
|--------|-------------|----------|
| Browse page (local) | Filter pills/buttons above the card grid on /browse page. Sort dropdown next to it. Clean separation of controls from nav. | ✓ |
| Header (global) | Category tabs in header (global). Persists across pages. More prominent but takes header space alongside search. | |
| Sidebar (desktop-only) | Left sidebar with category checkboxes + sort radio buttons. Desktop-friendly but breaks mobile layout or needs hamburger menu. | |

**User's choice:** Browse page (local) (Recommended)

**Notes:** Scoped to browse experience. Controls live above the card grid on the browse page.

### Question 2: State Persistence

| Option | Description | Selected |
|--------|-------------|----------|
| URL query params | URL like /browse?category=developer-tools&sort=alphabetical. ISR-friendly, shareable links, back button works correctly. | ✓ |
| Client-side state only | Client-side React state only. Fast switching, no page reload, but breaks shareable links and ISR caching. | |
| Shallow routing (hybrid) | Use Next.js shallow routing to update URL without triggering server render. Best of both but more complex. | |

**User's choice:** URL query params (Recommended)

**Notes:** Consistent with existing pagination and search patterns from Phases 2-3. ISR-friendly and supports shareable links.

---

## GitHub Stats Display

### Question 1: Detail Page Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Dedicated GitHub stats card | Prominent card/block below the install command with star/fork/issue counts and GitHub logo. Clear social proof. | ✓ |
| Inline metadata row | Small inline stats strip alongside version/homepage in the existing metadata section. Subtle, doesn't add vertical space. | |
| Sidebar stats panel | Right sidebar (if you add one) with GitHub stats, dependencies, etc. Separates metadata from main content. | |

**User's choice:** Dedicated GitHub stats card (Recommended)

**Notes:** Clear social proof without cluttering the hero section.

### Question 2: Metrics to Display

| Option | Description | Selected |
|--------|-------------|----------|
| All three metrics | Show all three metrics (stars, forks, issues) with icons. Complete picture of repo health. | ✓ |
| Stars only | Just stars — most recognizable social proof signal. Simpler, less cluttered. | |
| Stars + issues | Stars + issues. Stars show popularity, issues show activity/support burden. Skip forks (less relevant for end users). | |

**User's choice:** All three metrics

**Notes:** Complete picture of repository health and activity.

---

## GitHub Stats on Cards

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, add star count badge | Add a star count pill next to the existing install count pill on cards. Shows social proof at-a-glance. Only for casks with GitHub data. | ✓ |
| No, detail page only | Keep cards clean — stats are detail-page-only. Cards already show install count; adding stars clutters the metadata strip. | |
| GitHub icon indicator only | Add a subtle GitHub icon/indicator (no number) to cards that have GitHub repos. Signals 'this has stats' without adding numbers. | |

**User's choice:** Yes, add star count badge (Recommended)

**Notes:** Star count badge on browse cards for at-a-glance social proof. Only shown for casks with `github_enriched = true`.

---

## Pagination Fixes

### Question 1: Back-Button Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Full state restoration | Browser back button should restore the exact page/filter/sort state you left from. Use scroll restoration and URL state. | ✓ |
| URL state only, no scroll | Back button works but doesn't restore scroll position. Simpler but less polished. | |
| Client-side routing + history API | Use client-side routing (next/navigation) with scroll restoration and history state. More complex but smoothest UX. | |

**User's choice:** Full state restoration (Recommended)

**Notes:** Users expect to return to their exact browsing state (page, filter, sort, scroll position).

### Question 2: Perceived Lag Fix

| Option | Description | Selected |
|--------|-------------|----------|
| Loading skeletons (Phase 3 pattern) | Add loading skeletons for pagination transitions (Phase 3 added them for search). Gives instant feedback while ISR loads. | ✓ |
| Prefetch adjacent pages | Use Next.js `<Link prefetch>` to preload adjacent pages on hover. Page transitions feel instant. | |
| Skeletons + prefetch | Both: skeletons for slow transitions + prefetch for fast ones. Best UX but more complexity. | |

**User's choice:** Loading skeletons (Phase 3 pattern)

**Notes:** Consistent with Phase 3's loading state approach. Provides instant visual feedback during pagination transitions.

---

## Layout Width

| Option | Description | Selected |
|--------|-------------|----------|
| Responsive grid 1/2/3/4 cols | Mobile: 1 col, Tablet: 2 cols, Desktop (1024px+): 3 cols, Wide (1440px+): 4 cols. Adapts to screen size. | ✓ |
| Cap at 3 columns max | Mobile: 1 col, Tablet: 2 cols, Desktop: 3 cols. Stop at 3 to keep cards larger on ultra-wide displays. | |
| 3 cols with max-width container | Add a max-width container (1400px) so the grid doesn't stretch infinitely on wide screens. 3 cols within the container. | |

**User's choice:** Responsive grid 1/2/3/4 cols (Recommended)

**Notes:** Fully responsive grid adapts to all screen sizes. User explicitly requested better use of horizontal space on large screens, addressing wide empty space issue from Phase 2.

---

## the agent's Discretion

- Exact breakpoint pixel values for column transitions (suggested: standard Tailwind breakpoints 640px, 1024px, 1440px)
- GitHub stats card visual design (icons, spacing, link to repo)
- Filter UI choice: pills vs tabs based on final category count from Bedrock clustering
- Loading skeleton animation implementation (CSS pulse or shimmer)
- Sort dropdown component selection (shadcn/ui Select or native)
- Scroll restoration implementation details

## Deferred Ideas

- **Bedrock token costs:** If AWS Bedrock categorization is too expensive for ~7,659 casks, consider fallback to keyword-based inference or manual curation for initial launch
- **Multi-select category filters:** Phase 4 implements single-category filtering; multi-category filtering (`?category=X,Y,Z`) deferred to v2
- **Dependency graphs (BRWS-06):** "Browse by dependency" deferred to v2 per REQUIREMENTS.md
- **Trending/editorial sections (BRWS-05):** Curated homepage sections deferred to v2
- **Platform compatibility filter (SRCH-02):** Still no platform data in schema; deferred from Phase 3
