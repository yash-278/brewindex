---
name: sketch-findings-brewindex
description: Validated design decisions, CSS patterns, and visual direction from sketch experiments for BrewIndex. Auto-load during any UI implementation work on this project.
---

<context>
## Project: brewindex

Dark, developer-first aesthetic inspired by Raycast: near-black background (`#0e0e0e`), muted surface layers (`#1a1a1a`), electric blue-violet primary accent (`#7c6aff`). Generous whitespace, clean typography, vibrant hover effects. Scanning and discovery are the primary user actions — icons and names carry visual weight, descriptions provide context without dominating.

Reference points: **Raycast** (near-black bg, vibrant accent highlights, generous whitespace) and **GitHub dark** (information density, muted grays, subtle borders).

Sketch sessions wrapped: 2026-05-24
</context>

<design_direction>
## Overall Direction

**Palette:**
- Background: `#0e0e0e`
- Surface: `#1a1a1a` (cards), `#222222` (hover), `#242424` (raised)
- Border: `#2a2a2a` (standard), `#1f1f1f` (subtle)
- Text: `#f0f0f0` (primary), `#888888` (muted), `#555555` (faint)
- Primary accent: `#7c6aff` (default), `#9581ff` (hover), `rgba(124,106,255,0.15)` (dim bg)
- Success: `#4ade80`

**Typography:**
- Sans: `-apple-system, BlinkMacSystemFont, 'Inter', system-ui`
- Mono: `'JetBrains Mono', 'Fira Code', 'SF Mono', monospace`
- Scale: xs=0.6875rem, sm=0.8125rem, base=0.9375rem, lg=1.0625rem, xl=1.25rem, 2xl=1.5rem, 3xl=2rem

**Shapes:**
- Card radius: `14px` (browse cards), `10px` (install block, stat cards, inner elements), `18px` (large hero icons)
- Icon radius: `10px` (browse 52px), `18px` (detail hero 80px)
- Pill radius: `9999px`

**Interaction:**
- All interactive elements: `transition: all 0.15s ease`
- Card hover: accent border glow (`box-shadow: 0 0 0 1px rgba(124,106,255,0.3), 0 4px 12px rgba(124,106,255,0.15)`), no transform lift on grid cards
- Button hover: `transform: translateY(-1px)` is appropriate for isolated buttons (Copy), not grid cards

**Layout:**
- Max page width: `1280px` (browse), `1100px` (detail)
- Page padding: `24px` horizontal, `24px–32px` vertical
- Section labels: `font-size: 0.6875rem`, uppercase, `letter-spacing: 0.07em`, `color: var(--color-text-faint)`, `font-weight: 500`
</design_direction>

<findings_index>
## Design Areas

| Area | Reference | Key Decision |
|------|-----------|--------------|
| Browse Grid | references/browse-grid.md | Tall horizontal cards (52px icon + name + desc + metadata strip), 2-col auto-fill grid |
| Detail Page | references/detail-page.md | Hero header (80px icon + name + desc), install command section, stats+metadata side-by-side |

## Theme

The validated theme file: `sources/themes/default.css`

## Source Files

Original sketch HTML with all variants preserved in `sources/` for full reference.
- `sources/001-browse-grid/index.html` — Variants A–D; D is the winner
- `sources/002-detail-page/index.html` — Variants A–C; A is the winner
</findings_index>

<metadata>
## Processed Sketches

- 001-browse-grid (Winner: D — Tall Horizontal Cards)
- 002-detail-page (Winner: A — Hero Header)
</metadata>
