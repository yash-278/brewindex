# Browse Grid

## Design Decisions

### Card Layout — Tall Horizontal (Winner: Variant D)
Horizontal cards with a 52px icon pinned to the left, content body to the right. Rejected: icon-hero tiles (A), compact tiles with hover-only description (C), and short single-line rows (B). The tall horizontal format was chosen because it surfaces description always-on without sacrificing icon visibility, and the fixed height creates a predictable grid rhythm.

### Grid Structure
- `grid-template-columns: repeat(auto-fill, minmax(460px, 1fr))` — 2 columns at typical desktop widths
- `gap: 12px` between cards
- `max-width: 1280px` page container, `padding: 24px`

### Card Anatomy (top to bottom, left to right)
1. **Icon** — 52px × 52px, `border-radius: 10px`, top-aligned with 2px margin-top offset to align with name baseline. Initials fallback: 2-char uppercase, color derived from token name hash, white text.
2. **Card header row** — name (`font-size: 0.9375rem`, `font-weight: 600`) + version in small mono (`font-size: 10px`, `color: var(--color-text-faint)`) right-aligned baseline.
3. **Description** — `font-size: 0.8125rem`, `color: var(--color-text-muted)`, `-webkit-line-clamp: 2`, `line-height: 1.5`. Always visible — not hidden behind hover.
4. **Metadata strip** — flex row at bottom: installs pill (accent-colored), platform pill, mono token pushed right with `margin-left: auto`.

### Hover State
```css
border-color: rgba(124,106,255,0.4);
background: var(--color-surface-hover); /* #222222 */
box-shadow: 0 0 0 1px rgba(124,106,255,0.3), 0 4px 12px rgba(124,106,255,0.15);
```
No `transform: translateY` on the grid card — lift was tried but felt too heavy for a dense list. The glow shadow is sufficient.

### Metadata Strip Pills
```css
/* Installs pill — accented */
background: rgba(124, 106, 255, 0.15);
border: 1px solid rgba(124,106,255,0.25);
color: #9581ff;
border-radius: 9999px;
padding: 2px 8px;
font-size: 0.6875rem;

/* Platform pill — neutral */
background: var(--color-bg);
border: 1px solid var(--color-border);
color: var(--color-text-muted);
```

### Install Count Formatting
- ≥ 1M → `"X.XM"` (one decimal)
- ≥ 1K → `"XXXK"` (no decimal)
- Label: `"↓ {count} / yr"` for 365-day installs

### App Shell Header
- Height: 56px, `position: sticky`, `top: 44px` (accounts for variant nav in sketch; 0 in production)
- Logo: 24px icon chip (gradient `#7c6aff → #c084fc`) + "BrewIndex" wordmark, `font-weight: 700`, `letter-spacing: -0.02em`
- Search bar: centered, `max-width: 480px`, grayed out (`opacity: 0.55`) with "Search casks…" placeholder — non-functional in Phase 2
- Cask count: `margin-left: auto`, `font-size: 0.8125rem`, `color: var(--color-text-muted)`

### Pagination
- Centered flex row below the grid
- Page buttons: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, active page uses `var(--color-primary-dim)` background with accent border
- "← Prev" / "Next →" text buttons, not icon-only

## CSS Patterns

```css
/* Grid */
.browse-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
  gap: 12px;
}

/* Card */
.cask-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg); /* 14px */
  padding: 20px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.cask-card:hover {
  border-color: rgba(124,106,255,0.4);
  background: #222222;
  box-shadow: 0 0 0 1px rgba(124,106,255,0.3), 0 4px 12px rgba(124,106,255,0.15);
}

/* Icon */
.card-icon {
  width: 52px; height: 52px; flex-shrink: 0;
  border-radius: 10px;
  overflow: hidden;
  margin-top: 2px;
}
.card-icon.fallback {
  display: flex; align-items: center; justify-content: center;
  font-weight: 700; font-size: 18px; color: white;
}

/* Body */
.card-body {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 8px;
}
.card-header { display: flex; align-items: baseline; gap: 8px; }
.card-name { font-size: 0.9375rem; font-weight: 600; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.card-version { font-size: 10px; color: var(--color-text-faint); font-family: var(--font-mono); flex-shrink: 0; }
.card-desc { font-size: 0.8125rem; color: var(--color-text-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

/* Metadata strip */
.card-meta { display: flex; align-items: center; gap: 12px; margin-top: 4px; }
.card-token { font-family: var(--font-mono); font-size: 10px; color: var(--color-text-faint); margin-left: auto; }
```

## HTML Structure

```html
<div class="cask-card" onclick="...">
  <!-- Icon: real img or initials fallback -->
  <div class="card-icon fallback" style="background:{hashColor};">VS</div>

  <div class="card-body">
    <div class="card-header">
      <div class="card-name">Visual Studio Code</div>
      <div class="card-version">1.87.2</div>
    </div>
    <div class="card-desc">Code editor redefined and optimized…</div>
    <div class="card-meta">
      <div class="meta-pill installs">↓ 4.8M / yr</div>
      <div class="meta-dot">·</div>
      <div class="meta-pill">macOS</div>
      <div class="card-token">visual-studio-code</div>
    </div>
  </div>
</div>
```

## What to Avoid

- **Icon-hero tiles (Variant A):** Large icon on top with name below — wastes vertical space, makes the grid feel like an iOS home screen rather than a developer catalog.
- **Compact tiles (Variant C):** Description only on hover — browsers with touch input never see it; creates inconsistent experience.
- **Short single-line rows (Variant B):** Single-line description truncated — loses the browsing context that helps newcomers discover apps.
- **`transform: translateY` on hover:** Tested; felt too bouncy for a dense catalog grid. Box-shadow glow is more appropriate.
- **Stats on the browse card:** Install counts belong on the detail page. The metadata strip shows 365d count only as a discovery signal, not the full stats block.

## Origin
Synthesized from sketch: 001-browse-grid (Winner: Variant D)
Source file: `sources/001-browse-grid/index.html`
