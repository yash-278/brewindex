# Phase 1: Data Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-24
**Phase:** 1-Data Pipeline
**Areas discussed:** Cron frequency, GitHub enrichment batching, Schema shape, Sync strategy

---

## Cron Frequency

| Option | Description | Selected |
|--------|-------------|----------|
| Daily | Homebrew publishes once per day — more frequent syncs get stale data. Hobby plan covers this. Zero additional cost. | ✓ |
| Every 6 hours | Catches mid-day Homebrew republishes faster. Requires Vercel Pro (~$20/mo). | |
| On-demand only | Manual trigger via authenticated HTTP call. Not a production strategy. | |

**User's choice:** Daily
**Notes:** Matches Homebrew's actual publish cadence; no additional Vercel plan cost.

---

## GitHub Enrichment Batching

### Q1: Batching approach

| Option | Description | Selected |
|--------|-------------|----------|
| Same cron run, batched | Process in batches of ~4,500 with 1-hour sleep between batches. @octokit/plugin-throttling handles retry-after. | ✓ |
| Separate enrichment cron job | Second cron job enriches GitHub stats independently, offset by a few hours. | |
| Lazy enrichment on page view | GitHub stats fetched and cached on demand when a user views a cask. | |

**User's choice:** Enrich within the same cron run
**Notes:** Single job to maintain; plugin-throttling handles rate limit compliance automatically.

### Q2: GitHub credential

| Option | Description | Selected |
|--------|-------------|----------|
| Personal Access Token (PAT) | Fine-grained PAT with read:repo scope, stored as GITHUB_TOKEN. 5K req/hr. | ✓ |
| GitHub App token | Higher limits (up to 15K req/hr). More setup complexity. | |
| Unauthenticated | 60 req/hr limit — completely unviable. | |

**User's choice:** PAT
**Notes:** 5K/hr is sufficient for 7,659 casks processed in two batches over ~2 hours.

### Q3: Error handling for inaccessible repos

| Option | Description | Selected |
|--------|-------------|----------|
| Mark github_enriched=false, skip | Log failure, leave stats as NULL. Next sync retries. | ✓ |
| Retry immediately with backoff | Adds latency; 404s won't resolve on retry. | |

**User's choice:** Mark as github_enriched=false, skip gracefully
**Notes:** 404s are permanent failures — retrying wastes the run's rate limit budget.

---

## Schema Shape

### Q1: Table structure

| Option | Description | Selected |
|--------|-------------|----------|
| Single flat casks table | All fields inline, no joins. Simple queries. | ✓ |
| Normalized (casks + install_counts + github_stats) | Cleaner relational model, adds JOIN complexity for every query. | |

**User's choice:** Single flat casks table
**Notes:** Read-heavy cache of external data; normalization adds complexity without benefit.

### Q2: Field set

| Option | Description | Selected |
|--------|-------------|----------|
| Core only | name, token, description, version, homepage, icon_url, install counts, GitHub stats. | ✓ |
| Extended | Also include categories, platform_compatibility, caveats, bottle_url now. | |

**User's choice:** Core fields only
**Notes:** No Phase 1 consumer for extended fields; defer until a phase actually needs them.

---

## Sync Strategy

### Q1: Update mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Upsert on token | INSERT ... ON CONFLICT (token) DO UPDATE. Idempotent, fast, safe. | ✓ |
| Full replace (truncate + reinsert) | Simple but table is briefly empty mid-run; ISR serves stale data. | |
| Diff-only (skip unchanged) | Most efficient; requires checksum strategy since Homebrew has no per-cask updatedAt. | |

**User's choice:** Upsert on token
**Notes:** Idempotent — safe to run multiple times without data loss.

### Q2: Handling removed casks

| Option | Description | Selected |
|--------|-------------|----------|
| Soft-delete (set is_active=false, keep row) | Prevents ISR page 404s during Homebrew temporary unpublish. | ✓ |
| Hard-delete immediately | Simple but risks stale ISR pages for popular casks temporarily removed. | |

**User's choice:** Soft-delete
**Notes:** Keeps detail page accessible until ISR naturally revalidates after the cask returns.

### Q3: ISR cache invalidation

| Option | Description | Selected |
|--------|-------------|----------|
| revalidateTag('casks') post-sync | ISR pages reflect new data as soon as the sync completes. | ✓ |
| Rely on ISR TTL | Browse pages could show day-old data for hours post-sync. | |

**User's choice:** revalidateTag immediately post-sync
**Notes:** Already noted as a decision in STATE.md from the roadmap phase; confirmed here.

---

## Claude's Discretion

- Exact Homebrew JSON API endpoint structure and field mapping
- Drizzle schema migration tooling (drizzle-kit push vs. migrate)
- Vercel Blob upload approach for icons from within the sync job
- SSRF allowlist implementation details (fetch wrapper vs. middleware pattern)

## Deferred Ideas

- Categories / tag taxonomy → Phase 4 (Discovery Layer)
- Platform compatibility filter → Phase 3 (Search + Security)
- Cask caveats and install warnings → v2, post-MVP
- Bottle/binary download URL → v2, post-MVP
- Formulae (CLI tools) sync → future milestone
