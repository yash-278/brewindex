---
sketch: "002"
name: detail-page
question: "How are the install command, stats, and metadata arranged on the cask detail page?"
winner: "A"
tags: [layout, detail, install-command, stats]
---

# Sketch 002: Detail Page

## Design Question
How should the detail page arrange the install command CTA, install stats, and metadata to create a clear visual hierarchy that serves both newcomers (copy the command) and power users (check version, homepage)?

## How to View
```
open .planning/sketches/002-detail-page/index.html
```

## Variants

- **A: Hero Header** — Full-width icon + name + description banner at the top, install command below in a dedicated section, stats and metadata side-by-side below that. Most visual impact, but description takes space before the CTA.
- **B: Two-Column Sidebar** — Icon + meta + links in a fixed left sidebar (240px), name + description + install command + stats in the right main column. Familiar app-store/package-registry pattern. Sidebar stays visible as you scroll.
- **C: Single-Column Editorial** — Everything stacked in a narrow centered column (720px max), flowing top to bottom: icon+name → description → install command → stats → metadata. Clean, focused, minimal chrome.

## What to Look For

1. **Install command prominence** — can a newcomer find and copy the brew command within 2 seconds of landing?
2. **Stats readability** — do the 30/90/365d numbers scan well, or feel cluttered?
3. **Metadata density** — version, updated date, homepage, token — does this feel like the right amount of detail, or too much?
4. **Vertical rhythm** — does scrolling feel natural, or does important content get buried?
5. **Copy button interaction** — click it; does the "Copied!" feedback feel right?
