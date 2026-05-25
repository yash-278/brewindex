# Phase 3: Search + Security - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-25
**Phase:** 03-search-security
**Areas discussed:** Search UX, Search backend, Page transition jank, WAF rules

---

## Search UX

| Option | Description | Selected |
|--------|-------------|----------|
| Filter browse grid in place | Results stay on /browse, URL updates with ?q=... | ✓ |
| Dedicated /search page | Navigate to /search?q=... with its own layout | |

**User's choice:** Filter the browse grid in place

---

| Option | Description | Selected |
|--------|-------------|----------|
| Live as-you-type with debounce | Results update ~300ms after user stops typing | ✓ |
| On Enter / submit only | User hits Enter to trigger search | |

**User's choice:** Live as-you-type with debounce

---

| Option | Description | Selected |
|--------|-------------|----------|
| Hide pagination during search | Show up to 50 results, no paging | ✓ |
| Paginate search results too | Add ?page=N to search results | |

**User's choice:** Hide pagination during search

---

## Search Backend

| Option | Description | Selected |
|--------|-------------|----------|
| Postgres ILIKE | WHERE name ILIKE '%q%' — simple substring match | |
| Postgres tsvector FTS | GIN index + to_tsvector — fuzzy/ranked matching | ✓ |
| Fuse.js client-side | 7K cask JSON index in the browser | |

**User's choice:** Initially chose ILIKE, then corrected to tsvector/FTS — wants fuzzy search quality.
**Notes:** "We should use fuzzy search TS vector or something instead of I like"

---

| Option | Description | Selected |
|--------|-------------|----------|
| Generated column (STORED) | ALTER TABLE ... ADD COLUMN search_vector tsvector GENERATED ALWAYS AS (...) STORED | ✓ |
| Trigger-maintained column | PL/pgSQL trigger on INSERT/UPDATE | |

**User's choice:** Generated column on name + description

---

| Option | Description | Selected |
|--------|-------------|----------|
| /api/search?q=vscode | New API route returning JSON | ✓ |
| Server action | Next.js server action from form | |

**User's choice:** /api/search?q=vscode

---

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal fields | token, name, description, icon_url, icon_is_fallback | |
| Full cask row | All columns | ✓ |

**User's choice:** Full cask row

---

## Page Transition Jank

| Option | Description | Selected |
|--------|-------------|----------|
| Skeleton cards grid | Shimmer placeholders matching CaskCard layout | ✓ |
| Simple spinner | Centered loading spinner | |
| Progress bar at top | Thin loading bar (YouTube-style) | |

**User's choice:** Skeleton cards grid

---

| Option | Description | Selected |
|--------|-------------|----------|
| /browse only | Loading state on pagination transitions | |
| /cask/[token] only | Loading state on cask detail open | |
| Both | Loading states on both routes | ✓ |

**User's choice:** Both routes

---

## WAF / Security (Rate Limiting)

| Option | Description | Selected |
|--------|-------------|----------|
| API routes only | Rate limit /api/search, /api/cron, /api/revalidate | |
| All routes via Edge Middleware | Rate limit every request at the edge | |
| Skip / defer | User: Next.js handles this, Vercel CDN covers it | ✓ |

**User's choice:** Skip rate limiting — user believes Next.js/Vercel CDN layer handles it.
**Notes:** "I think it should be handled by next.js itself, right?" — deferred, not rejected.

---

## WAF Rules

| Option | Description | Selected |
|--------|-------------|----------|
| Basic: managed rulesets only | Enable Vercel's built-in bot/attack rulesets | ✓ |
| Skip WAF | Defer entirely | |
| Custom rules too | Write specific Vercel WAF custom rules | |

**User's choice:** Basic — enable managed rulesets only

---

## Claude's Discretion

- Exact debounce duration (300ms recommended)
- Skeleton shimmer implementation detail (CSS vs Tailwind animate-pulse)
- Minimum query length before search fires (suggest: 2 chars)
- Whether to show result count ("14 results for 'vscode'")
- Empty search state copy and icon
- Error handling if /api/search fails

## Deferred Ideas

- Rate limiting via @upstash/ratelimit — deferred by user decision; already in package.json
- Custom WAF rules — deferred until real threat patterns are known
- Sort controls (BRWS-03) — Phase 4
- Category filter (BRWS-02) — Phase 4
