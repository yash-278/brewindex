---
sketch: "001"
name: browse-grid
question: "How should the browse grid card lay out icon vs. name vs. description?"
winner: "D"
tags: [layout, browse, card, grid]
---

# Sketch 001: Browse Grid

## Design Question
How should the card in the browse grid balance icon prominence, name legibility, and description visibility?

## How to View
```
open .planning/sketches/001-browse-grid/index.html
```

## Variants

- **A: Icon-Hero Cards** — Large 56px icon, name below in bold, 2-line description below that. Grid fills columns (auto-fill min 172px). Feels like the macOS App Store or iOS home screen with more context per card.
- **B: Horizontal List-Cards** — 40px icon left, name + description to the right, token in small mono on the far right. Fills 2 columns of wide rows. Denser information; feels like Raycast search results or a GitHub repo list.
- **C: Compact Tiles** — 48px icon, name only, description visible on hover tooltip. Smallest footprint — fits the most apps per screen. Favors scanning over reading.

## What to Look For

1. **Icon prominence vs. information density** — does the icon size feel right relative to name/description, or does it waste vertical space?
2. **Card width** — do the columns feel airy or cramped at a realistic browser width?
3. **Description visibility** — does seeing the description on the card help browsing, or is it noise?
4. **Hover behavior** — does the card hover state feel responsive and clear enough to invite clicking?
5. **Grid rhythm** — does the grid feel like an App Store you'd want to browse, or a utilitarian list?
