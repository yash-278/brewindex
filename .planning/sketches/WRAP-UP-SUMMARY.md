# Sketch Wrap-Up Summary

**Date:** 2026-05-24
**Sketches processed:** 2
**Design areas:** Browse Grid, Detail Page
**Skill output:** `./.claude/skills/sketch-findings-brewindex/`

## Included Sketches

| # | Name | Winner | Design Area |
|---|------|--------|-------------|
| 001 | browse-grid | D — Tall Horizontal Cards | Browse Grid |
| 002 | detail-page | A — Hero Header | Detail Page |

## Excluded Sketches

*(none)*

## Design Direction

Dark, developer-first aesthetic inspired by Raycast. Near-black background (`#0e0e0e`), muted surface layers, electric blue-violet accent (`#7c6aff`). Scanning and discovery are primary — icons and names carry visual weight, descriptions provide context.

## Key Decisions

**Layout:**
- Browse: 2-column auto-fill grid (`minmax(460px, 1fr)`), tall horizontal cards with 52px icon left-anchored
- Detail: Full-width hero header (80px icon + large name + description), install command section below, stats+metadata side-by-side at the bottom

**Cards:**
- Horizontal orientation with icon, name+version header, 2-line always-visible description, metadata strip (installs pill + platform + mono token)
- `border-radius: 14px`, hover triggers accent glow shadow (no lift transform)

**Install command:**
- Dark bg block, mono text with muted prefix + accent token, prominent Copy button
- Copy → "Copied!" for 2s, green success state (`#4ade80`)

**Stats:**
- 30d / 90d / 365d as individual stat cards; 30d value gets accent color as primary signal
- Stats sit alongside metadata key-value table in a flex row

**Typography:**
- System sans stack (`Inter`-first), JetBrains Mono for code/tokens
- Section labels: small uppercase, faint, tight letter-spacing

**Color:**
- Primary: `#7c6aff` / `#9581ff` hover
- Installs pill: accent-tinted (`rgba(124,106,255,0.15)` bg, accent border and text)
- All other pills and meta: neutral surface with standard border
