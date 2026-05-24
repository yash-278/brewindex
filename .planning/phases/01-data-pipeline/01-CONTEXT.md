# Phase 1: Data Pipeline - Context

**Gathered:** 2026-05-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Populate Neon Postgres with all Homebrew cask data, icons, and GitHub stats. Refresh daily via a secured cron endpoint. No UI, no browse pages — pure data foundation that subsequent phases consume.

**Requirements in scope:** DATA-01, DATA-02, DATA-03, SECU-03, SECU-04

**Success criteria (from ROADMAP.md):**
1. Running the cron endpoint (with valid CRON_SECRET) populates Neon Postgres with all ~7,659 casks including name, token, description, version, homepage, and install counts
2. Each cask row has an icon_url pointing to a Vercel Blob asset (or a CSS initials fallback flag) — no hotlinked external favicons
3. Casks with a GitHub upstream repo have stars, forks, and open issue counts stored in the database
4. Calling the cron endpoint without a valid Bearer token returns 401 and performs no work
5. All server-side HTTP calls in the sync job are restricted to the explicit allowlist (formulae.brew.sh, api.github.com, Blob storage); any off-allowlist URL is blocked at the fetch wrapper

</domain>

<decisions>
## Implementation Decisions

### Cron Frequency
- **D-01:** Run once daily. Homebrew publishes once per day — more frequent syncs get stale data. Hobby plan covers once/day at zero additional cost.

### GitHub Enrichment Batching
- **D-02:** Enrich GitHub stats within the same cron run. Process casks in batches of ~4,500 with a 1-hour sleep between batches so the run stays under the 5K/hr authenticated limit. `@octokit/plugin-throttling` handles retry-after automatically.
- **D-03:** Use a Personal Access Token (PAT) with `read:repo` scope, stored as `GITHUB_TOKEN` env var. 5K req/hr is sufficient for 7,659 casks processed in two batches.
- **D-04:** If a cask's GitHub repo returns 404 or is inaccessible: log the failure, set `github_enriched = false`, leave github_stars/forks/issues as NULL. The next sync retries automatically. No immediate retry.

### Schema Shape
- **D-05:** Single flat `casks` table — all fields inline, no joins required. Over-normalizing a read-heavy external cache is premature.
- **D-06:** Core fields only in Phase 1: `id`, `token`, `name`, `description`, `version`, `homepage`, `icon_url`, `icon_is_fallback` (bool), `install_30d`, `install_90d`, `install_365d`, `github_stars`, `github_forks`, `github_issues`, `github_enriched` (bool), `is_active` (bool), `last_synced_at`. Defer categories, platform_compatibility, caveats, bottle_url to later phases.

### Sync Strategy
- **D-07:** Upsert on `token` — `INSERT ... ON CONFLICT (token) DO UPDATE`. Idempotent, fast, safe.
- **D-08:** Soft-delete casks that vanish from the Homebrew API: set `is_active = false`, keep the row. Prevents ISR page 404s during any Homebrew temporary unpublish. Hard-delete can happen later after a grace period.
- **D-09:** Call `revalidateTag('casks')` immediately after a successful sync to flush ISR caches. No stale-browse risk.

### Claude's Discretion
- Exact Homebrew JSON API endpoint structure and field mapping (researcher to confirm)
- Drizzle schema migration tooling (`drizzle-kit push` for dev, `drizzle-kit migrate` for prod)
- Vercel Blob upload approach for icons (direct upload from sync job)
- SSRF allowlist implementation details (fetch wrapper vs. middleware)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Foundation
- `.planning/PROJECT.md` — Core value, constraints, key decisions table
- `.planning/REQUIREMENTS.md` — DATA-01, DATA-02, DATA-03, SECU-03, SECU-04 with acceptance criteria; traceability table

### Roadmap & Phase Scope
- `.planning/ROADMAP.md` §Phase 1 — Goal, success criteria, requirements list

### Stack Reference (from CLAUDE.md)
- `CLAUDE.md` §Technology Stack — Neon serverless driver pattern, Drizzle + neon-http integration, @octokit/rest + @octokit/plugin-throttling setup, Upstash Redis for rate limiting, Vercel Blob for icon storage, icon fallback strategy (DuckDuckGo favicon service → CSS initials)
- `CLAUDE.md` §Key Constraints & Gotchas — Cask dataset size (#1), No icon field in Homebrew API (#2), Cron job frequency limits (#4), GitHub API rate limits (#5)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None yet — greenfield project. No existing components, hooks, or utilities.

### Established Patterns
- None established yet. Phase 1 sets the patterns that subsequent phases follow.

### Integration Points
- The `casks` table created in this phase is the primary data source for Phase 2 (Catalog UI), Phase 3 (Search), and Phase 4 (Discovery Layer).
- `revalidateTag('casks')` called here must use the same tag string that Phase 2's ISR pages register via `fetch(..., { next: { tags: ['casks'] } })`.

</code_context>

<specifics>
## Specific Ideas

- Icon fetch strategy: DuckDuckGo favicon service (`https://icons.duckduckgo.com/ip3/<domain>.ico`) using the cask's `homepage` URL domain. If fetch fails or returns a blank/error, set `icon_is_fallback = true` and store a CSS initials placeholder instead.
- Homebrew cask count: ~7,659 casks (as of research; sync job should handle the full set dynamically from the API response, not a hardcoded count).
- GitHub repo detection: Parse `homepage` field for `github.com` URLs (excluding `google/fonts` and similar non-app repos as noted in success criteria).

</specifics>

<deferred>
## Deferred Ideas

- Categories / tag taxonomy — belongs in Phase 4 (Discovery Layer)
- Platform compatibility (arm64, x86_64) filter — belongs in Phase 3 (Search + Security)
- Cask caveats and install warnings — v2 requirement, post-MVP
- Bottle/binary download URL — v2 requirement, post-MVP
- Formulae (CLI tools) sync — deferred to a future milestone, casks first

</deferred>

---

*Phase: 1-Data Pipeline*
*Context gathered: 2026-05-24*
