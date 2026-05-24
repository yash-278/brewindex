# Features Research: BrewIndex

**Domain:** App Store-like software catalog for Homebrew casks
**Researched:** 2026-05-24
**Confidence:** HIGH — all claims backed by live data from Homebrew API, App Store, AlternativeTo, and Repology

---

## Table Stakes (must have or users leave)

These are features users unconsciously expect from any software catalog. Their absence causes immediate bounce or a "this feels broken" reaction.

| Feature | Why Expected | Data Source Available? | Complexity |
|---------|--------------|------------------------|------------|
| Full-text search across name + description | Every catalog since 2005 has a search box; formulae.brew.sh has none — this is BrewIndex's first win | Homebrew JSON API (`token`, `name[]`, `desc`) — can be indexed locally | Medium (needs search index: Fuse.js or pg full-text) |
| Visual card/grid browse of all casks | App Store, Flathub, AlternativeTo all use card grids; a flat alphabetical list (brew.sh) feels like a directory listing | Full cask list from `formulae.brew.sh/api/cask.json` (~6,000 casks) | Low |
| One-click copy of install command | Core value prop: `brew install --cask <name>` prominently shown and copyable | Token from cask JSON | Low |
| Cask detail page with full metadata | Users click through to learn before installing; bare list is not enough | Full cask JSON per token | Low |
| Install count / popularity ranking | "Is this popular?" is the first question a newcomer asks; analytics already exist | `analytics.install.{30d,90d,365d}` in cask JSON | Low |
| App homepage link | Users want to verify they're getting the right app | `homepage` field in cask JSON | Low |
| Current version display | Users want to know if Homebrew has the latest version | `version` field in cask JSON | Low |
| macOS version / architecture compatibility | Newcomers especially need to know if it works on their Mac (Apple Silicon vs Intel) | `depends_on.macos`, `variations` keyed by macOS version + arch | Medium (need to render the matrix legibly) |
| Deprecated / disabled status clearly surfaced | Installing a dead cask is a bad experience; must be visible before clicking install | `deprecated`, `disabled` flags + reason fields in cask JSON | Low |
| Fast page loads | Any perceptible lag on search or browse abandons the session | ISR/static generation on Vercel handles this | Low (architectural, not feature) |

**Confidence:** HIGH — verified against live Homebrew JSON API, App Store behavior, AlternativeTo, and formulae.brew.sh gaps.

---

## Differentiators (what makes BrewIndex worth using over brew.sh)

These features don't exist on any current Homebrew browsing surface, or exist only in degraded form. Delivering even 2-3 of these creates a product worth linking to.

### Tier 1 — High Impact, Feasible in v1

| Feature | Why It Differentiates | Data Source | Complexity |
|---------|-----------------------|-------------|------------|
| Category / tag browse | brew.sh has zero categorization — 6,000 casks dumped alphabetically. Even basic buckets ("Browsers", "Dev Tools", "Media", "Productivity") dramatically improve discoverability for newcomers | No official taxonomy exists in cask JSON — must be derived (see notes below) | High (taxonomy requires upfront work: either manual curation, rule-based classification from desc, or LLM-tagging at sync time) |
| GitHub social proof block | Stars, forks, language, license, last-push date — surface on detail page. AlternativeTo does this in the sidebar; brew.sh doesn't at all | GitHub API (`/repos/{owner}/{repo}`) — owner+repo parseable from `homepage` or `url` for most casks | Medium (requires GitHub API calls at sync time, not per request) |
| "Auto-updates" indicator | Many casks self-update (Chrome, Slack, Notion); knowing this changes whether a user tracks the cask. Currently hidden in the Ruby source | `auto_updates` boolean in cask JSON | Low (display only) |
| Caveats surfaced prominently | Post-install caveats (e.g., "allow in Security settings", "Rosetta required") are buried in CLI output; new users miss them entirely | `caveats` field in cask JSON | Low (display only, but needs good UI treatment) |
| "Also available as" / conflict links | Show when a cask conflicts with a beta or nightly variant, and link to those variants | `conflicts_with.cask[]` in cask JSON | Low |
| Trending / recently updated section | App Store homepage has "Featured" and "Top Charts"; BrewIndex can show "Most installed this month" and "Recently updated" using analytics + `generated_date` | Analytics API + cask JSON `generated_date` | Low |
| Supported languages display | Firefox supports 100+ languages; Figma ships in 5. Useful signal for non-English users | `languages[]` array in cask JSON | Low |

### Tier 2 — Medium Impact, Feasible Post-v1 but Worth Noting

| Feature | Why It Differentiates | Notes |
|---------|-----------------------|-------|
| Version history / changelog | App Store shows "What's New" per release; brew.sh shows only current version | Would require scraping the cask's GitHub release history — not in Homebrew API |
| Dependency graph visualization | BrewIndex's PROJECT.md lists this as a requirement; a visual graph (not just a list) is more useful | `depends_on.cask` + `depends_on.formula` fields exist; most casks have shallow deps |
| "Install with this" bundle generator | macapps.link exists but is static and unmaintained; a dynamic "select apps → get script" feature is genuinely useful for new Mac setup | Medium complexity; requires client-side state |
| Search by GitHub topic/language | Power users often want "show me all Electron apps" or "Rust-based tools" — only possible if GitHub metadata is enriched at sync time | Requires GitHub API enrichment |

---

## Anti-Features (deliberately exclude)

These are features that appear valuable but would bloat v1, create maintenance burden, or undermine the read-only catalog model.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| User accounts and authentication | PROJECT.md explicitly out-of-scope; adds massive auth surface, GDPR concerns, and engineering overhead | Keep entirely public and read-only; no login prompt anywhere |
| User reviews and ratings | Moderation burden, spam vectors, cold-start problem (no reviews = looks dead), storage costs | Use Homebrew install counts as social proof — they're objective and already exist |
| Real-time Homebrew API proxy | Would hit Homebrew's API on every user request, risk rate-limiting, and add latency | Cache layer (ISR + DB) absorbs all user traffic; sync job runs on a schedule |
| Formula (CLI tools) listings in v1 | Formulae have no icons, less recognizable names — weakens the visual App Store feel | Casks only; formulae deferred to a later milestone |
| Package version pinning / install history tracking | Requires per-user state, which requires accounts | Link to official Homebrew docs for pinning |
| Comparison tables ("X vs Y") | High editorial overhead; gets stale fast | Link to AlternativeTo for comparisons — they already do this well |
| Homebrew tap management (adding third-party taps) | Dramatically increases scope and security surface; third-party taps have no quality guarantees | Stay within `homebrew/cask` official tap only in v1 |
| Dark/light mode toggle as a launch feature | Technically low cost but a design distraction pre-launch | Build in a design system that supports both; ship whichever the chosen design uses |
| Pagination with "load more" on search | Infinite scroll or paginated search UX is a trap — fast filtered search with a visible result count is better | Show all results with client-side filtering; ISR handles the static catalog |
| App screenshots / preview images | No screenshot data exists in the Homebrew API; scraping app homepages for screenshots is fragile and legally ambiguous | App icon (derivable from the `.app` name) is enough for v1 |

---

## Feature Complexity Notes

### Category Taxonomy — The Hardest Feature

The single most impactful differentiator for discovery (category browse) has no official data source. Options:

1. **Manual curation** — Tag the top 500 casks (covers ~80% of installs) by hand. Feasible once.
2. **Rule-based from `desc`** — Keyword matching on the one-line description. Fast, but noisy.
3. **LLM classification at sync time** — Run `desc` + `homepage` through an LLM to assign a category. Most accurate; adds cost at sync time (~$0.002/cask at GPT-4o-mini rates = ~$12 for 6,000 casks, one-time).
4. **Community-contributed tags** — Post-launch; requires user submissions which requires moderation.

**Recommendation:** LLM classification at first sync, stored in the database, manually corrected for the top 100 casks. This is a one-time enrichment cost, not a per-request cost.

### GitHub Enrichment — Rate Limit Risk

~80% of casks link to a GitHub homepage. Enriching 6,000 casks via the GitHub API requires ~6,000 authenticated requests. At GitHub's 5,000 req/hr limit with a Personal Access Token this takes about 1.2 hours for a full sync. Strategies:

- Use a GitHub App token (higher rate limits)
- Only enrich casks that have changed since last sync (use `tap_git_head` to detect)
- Cache enrichment aggressively (GitHub repo metadata changes infrequently)

**Risk:** GitHub API enrichment is a dependency that can fail silently. Display GitHub data as an enhancement only — the page must be useful without it.

### Search at Scale

6,000+ casks is small enough for client-side full-text search (Fuse.js on the catalog JSON, loaded once). No server-side search infrastructure needed in v1. At 10,000+ entries consider server-side search (Postgres full-text or Typesense).

### Install Count as the Primary Sort

The analytics API provides exact install counts for 30d/90d/365d. This is unique among package catalogs — most don't expose download telemetry. Make this the default sort order for browse ("Most Popular"), and allow switching to "Recently Updated" or alphabetical.

---

## Dependencies Between Features

```
Search ──────────────────────────────────────────────► Detail Page
Browse (grid) ────────────────────────────────────────► Detail Page
Detail Page ─────────────────────────────────────────►
  ├── install command (token)                          [cask JSON]
  ├── popularity stats (install counts)                [analytics embed in cask JSON]
  ├── GitHub block (stars, forks, license, language)   [GitHub API enrichment at sync]
  ├── auto_updates indicator                           [cask JSON]
  ├── caveats block                                    [cask JSON]
  ├── macOS compat matrix                              [variations + depends_on]
  └── conflicts / related variants                     [conflicts_with field]

Category Browse ──────────────────────────────────────►
  └── Category Taxonomy                                [enrichment layer, no native source]
      └── LLM sync job OR manual curation

Trending Section ─────────────────────────────────────►
  └── Analytics API (install counts)                  [already in cask JSON]

"Also installs" / Dependency Graph ──────────────────►
  └── depends_on.cask + depends_on.formula             [cask JSON, shallow in most cases]
```

### Build Order Implication

Because the cask JSON includes analytics inline (no second API call per cask), the core loop — sync cask JSON → render browse + detail pages — is self-contained. GitHub enrichment and category taxonomy are layered on top and can fail without breaking the base experience. Build in this order:

1. Cask JSON sync → browse grid → detail page → install copy (MVP loop, all from one API)
2. Analytics-based sort + trending (free from the same data)
3. GitHub enrichment block (adds a sync dependency but high UX value)
4. Category taxonomy (highest impact discovery feature, but independent enrichment task)

---

## Sources

- Live Homebrew JSON API: `formulae.brew.sh/api/cask/{token}.json` — verified 2026-05-24, HIGH confidence
- Live Homebrew Analytics API: `formulae.brew.sh/api/analytics/cask-install/30d.json` — 9,659 entries counted directly, HIGH confidence
- Homebrew Cask Cookbook: `docs.brew.sh/Cask-Cookbook` — no categories/screenshots/license in official schema, HIGH confidence
- formulae.brew.sh cask listing and detail pages — verified feature gaps (no search, no categories, no screenshots), HIGH confidence
- AlternativeTo app detail page structure — verified via live scrape, HIGH confidence
- Mac App Store (Xcode listing) — sections verified via live scrape, HIGH confidence
- GitHub REST API (`/repos/{owner}/{repo}`) — fields verified against microsoft/vscode and obsidianmd/obsidian-releases, HIGH confidence
- macapps.link — static bundle generator, LOW activity / maintenance, verified via scrape
- Repology — cross-repository package tracking, verified via scrape, not directly comparable to BrewIndex scope
