# Phase 2: Catalog UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 2-Catalog UI
**Areas discussed:** Sketch-first gate, Browse pagination, Card information density, App shell & chrome

---

## Sketch-first gate

### How should we handle the CLAUDE.md sketch-first requirement?

| Option | Description | Selected |
|--------|-------------|----------|
| Run /gsd-sketch first | Generate 2-3 HTML mockups before planning; design system from chosen sketch | ✓ |
| Capture design intent in CONTEXT.md | Skip sketch generation; describe aesthetic for planner to interpret | |
| Defer sketches to a UI phase | Plan data-fetching first, design in a follow-on pass | |

**User's choice:** Run /gsd-sketch first

---

### Which pages should /gsd-sketch cover?

| Option | Description | Selected |
|--------|-------------|----------|
| Browse grid + detail page | Two core in-scope pages | ✓ |
| Browse grid only | Detail page derived from sketch | |
| Home/landing + browse grid + detail page | Three surfaces | |

**User's choice:** Browse grid + detail page

---

### What visual mood?

| Option | Description | Selected |
|--------|-------------|----------|
| Mac App Store — clean, white, spacious | High-contrast cards, generous padding | |
| Dark / developer-first | Dark bg, muted colors, GitHub/Raycast aesthetic | ✓ |
| Hybrid — light default, dark mode toggle | Light-first with full dark mode | |

**User's choice:** Dark / developer-first

---

## Browse pagination

### Pagination strategy for 7,000+ casks

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor-based pages | URL-driven ?page=N; ISR-cached Server Component per page | ✓ |
| Infinite scroll (client-driven) | Load-more via client fetch; breaks ISR caching | |
| Load-more button (hybrid) | Server Action appends rows; prevents ISR of intermediate states | |

**User's choice:** Cursor-based pages

---

### Casks per page

| Option | Description | Selected |
|--------|-------------|----------|
| 48 per page | Clean grid at 2/3/4 columns; ~145 pages total | ✓ |
| 24 per page | Smaller chunks; ~290 pages total | |
| 100 per page | Fewer pages; heavier per-page query | |

**User's choice:** 48 per page

---

### Default sort

| Option | Description | Selected |
|--------|-------------|----------|
| Most popular (install_365d DESC) | Surfaces recognizable apps for newcomers; matches success criterion 1 | ✓ |
| Alphabetical (token ASC) | Predictable but surfaces obscure tools first | |
| Most recently updated (last_synced_at DESC) | Essentially noise since all casks sync daily | |

**User's choice:** Most popular (install_365d DESC)

---

## Card information density

### What does a browse card show?

| Option | Description | Selected |
|--------|-------------|----------|
| Icon + name + description | Clean, spacious; stats on detail page only | ✓ |
| Icon + name + description + install count | Popularity badge on card | |
| Icon + name + description + version badge | Version visible on card | |

**User's choice:** Icon + name + description only

---

### Fallback icon treatment

| Option | Description | Selected |
|--------|-------------|----------|
| CSS initials avatar | Colored square/circle with initials; consistent with Phase 1 decision | ✓ |
| Generic Homebrew logo placeholder | Same placeholder for all fallbacks | |
| Name-only card, no icon area | Skip icon slot when fallback | |

**User's choice:** CSS initials avatar

---

### Long description handling

| Option | Description | Selected |
|--------|-------------|----------|
| Truncate to 2 lines (line-clamp-2) | Uniform card height; full text on detail page | ✓ |
| Truncate to 1 line (line-clamp-1) | More compact, less context | |
| Full description, variable card height | No truncation; masonry layout needed | |

**User's choice:** line-clamp-2

---

## App shell & chrome

### Header for Phase 2

| Option | Description | Selected |
|--------|-------------|----------|
| BrewIndex branding + placeholder search bar | Establishes identity; non-functional search prevents Phase 3 layout shift | ✓ |
| Minimal header — logo only | Simpler; Phase 3 adds full bar | |
| No persistent header | Inline title only; hard to evolve into app-like product | |

**User's choice:** Header with BrewIndex branding + placeholder search bar

---

### Root route (/)

| Option | Description | Selected |
|--------|-------------|----------|
| / redirects to /browse | Catalog IS the product; no landing page needed | ✓ |
| / is a hero + CTA → /browse | Marketing landing page | |
| / is the browse grid (no /browse route) | Simpler routing; awkward if landing page added later | |

**User's choice:** / redirects to /browse

---

### Cask detail page URL

| Option | Description | Selected |
|--------|-------------|----------|
| /cask/[token] | Clean, readable, collision-safe | ✓ |
| /[token] (root-level) | Shorter but collides with /browse, /api, etc. | |
| /app/[token] | More scoped; 'app' aligns with casks-as-macOS-apps framing | |

**User's choice:** /cask/[token]

---

## Claude's Discretion

- Responsive grid breakpoints (2-col mobile, 3-col tablet, 4-col desktop)
- shadcn/ui Card subcomponent choices
- ISR revalidation tag wiring (`revalidateTag('casks')`)
- `generateStaticParams` implementation for top-500 pages
- Page metadata (title, OG tags) for browse and detail pages
- Error/not-found handling for invalid cask tokens
- Clipboard API implementation for copy-install-command

## Deferred Ideas

- Dark mode toggle / light mode support — future phase or post-MVP
- Category filter on browse grid — Phase 4 (Discovery Layer)
- Sort controls (alphabetical, recently updated) — Phase 4
- Search functionality — Phase 3
- GitHub stats block on detail page — Phase 4 (DETL-05)
- Platform compatibility filter — Phase 3
- Cask caveats and install warnings — v2 requirement
