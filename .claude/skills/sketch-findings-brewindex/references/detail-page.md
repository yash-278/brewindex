# Detail Page

## Design Decisions

### Layout — Hero Header (Winner: Variant A)
Full-width hero banner containing icon + name + version + description + links, followed by a dedicated install command section, then stats and metadata arranged side-by-side below. Rejected: two-column sidebar (B — sidebar feels heavy, doesn't earn the space for a single cask), single-column editorial (C — too narrow, stats feel underweight at 720px max).

### Hero Section
- 80px icon, `border-radius: 18px`
- Name: `font-size: 2rem`, `font-weight: 700`, `letter-spacing: -0.03em`, `line-height: 1.1`
- Version + last updated: small mono, `color: var(--color-text-faint)`, `margin-top: 4px`
- Description: `font-size: 0.9375rem`, `color: var(--color-text-muted)`, `max-width: 640px`, `line-height: 1.6`, `margin-top: 12px`
- Homepage + GitHub links: small pill-buttons below description, `border: 1px solid var(--color-border)`, accent border on hover
- `border-bottom: 1px solid var(--color-border)` separates hero from below-fold content
- `padding-top: 40px; padding-bottom: 32px`

### Install Command Block
- Placed immediately below the hero, `max-width: 640px`
- Section label: `"INSTALL"` in small uppercase, `color: var(--color-text-faint)`, `letter-spacing: 0.07em`
- Command display: `background: var(--color-bg)`, `border: 1px solid var(--color-border)`, `border-radius: 10px`, `padding: 12px 16px`
- Command text: mono font — `"brew install --cask "` in muted, token name in `var(--color-primary-hover)` (`#9581ff`)
- Copy button: `background: var(--color-primary)` (`#7c6aff`), white text, `font-weight: 500`, pill shape, `padding: 7px 16px`
- Copied state: `background: var(--color-success)` (`#4ade80`), dark text, 2-second timeout

### Install Button Interaction
```js
btn.textContent = 'Copied!';
btn.classList.add('copied'); // green background
setTimeout(() => {
  btn.textContent = 'Copy';
  btn.classList.remove('copied');
}, 2000);
```
No clipboard API call needed in the sketch — real implementation uses `navigator.clipboard.writeText('brew install --cask ' + token)`.

### Stats Block
- Section label: `"INSTALL STATS"`
- Three `stat-card` components: 30 days, 90 days, 365 days
- Each card: `background: var(--color-surface)`, `border: 1px solid var(--color-border)`, `border-radius: 10px`, `padding: 16px 20px`, `min-width: 110px`
- Value: `font-size: 1.25rem`, `font-weight: 700`, `letter-spacing: -0.02em`; 30-day value gets `color: var(--color-primary-hover)` accent
- Label: `font-size: 0.6875rem`, uppercase, `letter-spacing: 0.06em`, `color: var(--color-text-faint)`

### Metadata Table (Details)
- Placed alongside stats in a flex row (`gap: 32px`)
- Section label: `"DETAILS"`
- Key-value rows: key is 80px wide, `font-size: 0.6875rem`, uppercase, faint; value is `font-size: 0.8125rem`, muted
- Fields: Token (mono code chip), Version, Platform, Updated, Homepage (accent link)
- Token displayed as inline `<code>`: `background: var(--color-bg)`, `border: 1px solid var(--color-border)`, `border-radius: 3px`, `padding: 1px 5px`

### Breadcrumb Navigation
- Header right side: `Browse / [Cask Name]`
- "Browse" is a clickable link (accent on hover), separator is `/` in faint color
- Provides a clear back-path to the grid

## CSS Patterns

```css
/* Hero */
.hero {
  border-bottom: 1px solid var(--color-border);
  padding: 40px 0 32px;
  display: flex; align-items: flex-start; gap: 24px;
}
.hero-icon {
  width: 80px; height: 80px; flex-shrink: 0;
  border-radius: 18px;
  display: flex; align-items: center; justify-content: center;
  font-size: 30px; font-weight: 700; color: white;
}
.hero-name {
  font-size: 2rem; font-weight: 700;
  color: var(--color-text); letter-spacing: -0.03em; line-height: 1.1;
}
.hero-desc {
  font-size: 0.9375rem; color: var(--color-text-muted);
  margin-top: 12px; max-width: 640px; line-height: 1.6;
}

/* Install block */
.install-block {
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: 10px; padding: 12px 16px;
  display: flex; align-items: center; gap: 12px;
}
.install-cmd { flex: 1; font-family: var(--font-mono); font-size: 0.8125rem; }
.cmd-prefix { color: var(--color-text-faint); }
.cmd-cask   { color: #9581ff; }

.copy-btn {
  background: #7c6aff; border: none; border-radius: 6px;
  color: white; cursor: pointer; font-size: 0.8125rem; font-weight: 500;
  padding: 7px 16px; transition: all 0.15s ease; flex-shrink: 0;
}
.copy-btn:hover { background: #9581ff; transform: translateY(-1px); }
.copy-btn.copied { background: #4ade80; color: #0a0a0a; }

/* Stats */
.stat-group { display: flex; gap: 12px; flex-wrap: wrap; }
.stat-card {
  background: var(--color-surface); border: 1px solid var(--color-border);
  border-radius: 10px; padding: 16px 20px;
  display: flex; flex-direction: column; gap: 2px; min-width: 110px;
}
.stat-label { font-size: 0.6875rem; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.06em; }
.stat-value { font-size: 1.25rem; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em; }
.stat-value.accent { color: #9581ff; }

/* Metadata */
.meta-list { display: flex; flex-direction: column; gap: 10px; }
.meta-row  { display: flex; gap: 12px; align-items: baseline; }
.meta-key  { font-size: 0.6875rem; color: var(--color-text-faint); text-transform: uppercase; letter-spacing: 0.06em; width: 80px; flex-shrink: 0; }
.meta-val  { font-size: 0.8125rem; color: var(--color-text-muted); }
.meta-val code {
  font-family: var(--font-mono); font-size: 11px;
  background: var(--color-bg); border: 1px solid var(--color-border);
  border-radius: 3px; padding: 1px 5px; color: var(--color-text-muted);
}
```

## HTML Structure

```html
<div class="page-wrap">
  <!-- Hero -->
  <div class="hero">
    <div class="hero-icon" style="background:#007ACC;">VS</div>
    <div class="hero-body">
      <div class="hero-name">Visual Studio Code</div>
      <div class="hero-version">v1.87.2 · Last updated 3 days ago</div>
      <div class="hero-desc">Code editor redefined and optimized…</div>
      <div class="hero-links">
        <a class="link-btn">↗ code.visualstudio.com</a>
        <a class="link-btn">⭐ github.com/microsoft/vscode</a>
      </div>
    </div>
  </div>

  <!-- Below hero -->
  <div class="below-hero">
    <!-- Install command -->
    <div class="install-section">
      <div class="section-label">Install</div>
      <div class="install-block">
        <div class="install-cmd">
          <span class="cmd-prefix">brew install --cask </span>
          <span class="cmd-cask">visual-studio-code</span>
        </div>
        <button class="copy-btn" onclick="doCopy(this)">Copy</button>
      </div>
    </div>

    <!-- Stats + Metadata -->
    <div class="stats-meta">
      <div class="stats-col">
        <div class="section-label">Install Stats</div>
        <div class="stat-group">
          <div class="stat-card"><div class="stat-label">30 days</div><div class="stat-value accent">421K</div></div>
          <div class="stat-card"><div class="stat-label">90 days</div><div class="stat-value">1.2M</div></div>
          <div class="stat-card"><div class="stat-label">365 days</div><div class="stat-value">4.8M</div></div>
        </div>
      </div>
      <div class="stats-col">
        <div class="section-label">Details</div>
        <div class="meta-list">
          <div class="meta-row"><span class="meta-key">Token</span><span class="meta-val"><code>visual-studio-code</code></span></div>
          <div class="meta-row"><span class="meta-key">Version</span><span class="meta-val">1.87.2</span></div>
          <div class="meta-row"><span class="meta-key">Platform</span><span class="meta-val">macOS 11.0+</span></div>
          <div class="meta-row"><span class="meta-key">Updated</span><span class="meta-val">May 21, 2026</span></div>
          <div class="meta-row"><span class="meta-key">Homepage</span><span class="meta-val"><a href="#">code.visualstudio.com ↗</a></span></div>
        </div>
      </div>
    </div>
  </div>
</div>
```

## What to Avoid

- **Two-column sidebar (Variant B):** Fixed 240px sidebar feels heavy for a single app's metadata — too much screen devoted to a narrow panel that doesn't justify itself until Phase 4 adds GitHub stats.
- **Single-column editorial (Variant C):** 720px max-width feels too narrow at desktop; the stats row looks underweight. The centered column works for text-heavy content, not data-rich catalog pages.
- **Install command below the stats:** Stats are secondary; the copy command is the primary action. It should appear before the numbers.
- **Copy button as icon-only:** The text "Copy" → "Copied!" feedback cycle is more legible than an icon state change. Do not replace with just a clipboard icon.
- **Description truncated on detail page:** Unlike the browse card (2-line clamp), the full description should be visible on the detail page. No line-clamp here.

## Origin
Synthesized from sketch: 002-detail-page (Winner: Variant A)
Source file: `sources/002-detail-page/index.html`
