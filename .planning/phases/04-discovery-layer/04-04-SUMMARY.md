---
phase: 04-discovery-layer
plan: 04
subsystem: infra
tags: [aws-bedrock, nova-micro, categorization, ml, batch-inference, tsx, scripts]

# Dependency graph
requires:
  - phase: 04-01
    provides: category column in casks table, schema import paths
provides:
  - scripts/categorize-casks.ts — one-time ML categorization job via AWS Bedrock
  - AWS credential documentation in .env.example
  - @aws-sdk/client-bedrock-runtime and @aws-sdk/credential-providers dependencies
affects: [04-02-browse-page-ui, browse-category-filters]

# Tech tracking
tech-stack:
  added:
    - "@aws-sdk/client-bedrock-runtime ^3.1053.0"
    - "@aws-sdk/credential-providers (SSO support)"
  patterns:
    - Parallel batch execution with Promise.allSettled (batches of 20)
    - AWS Nova Micro request format (inferenceConfig.maxTokens, content array)
    - Nova Micro response parsing (output.message.content[0].text)
    - Credential check accepts AWS_PROFILE (SSO) OR static key/secret
    - DB flush after each batch of 20 (frequent checkpoints vs 100-sequential)

key-files:
  created:
    - scripts/categorize-casks.ts
  modified:
    - package.json
    - .env.example

key-decisions:
  - "Switched from Claude 3.5 Haiku to Amazon Nova Micro (~$0.14 total vs ~$30 — ~200x cheaper for single-label classification)"
  - "Parallel batches of 20 concurrent Bedrock calls instead of sequential — reduces ~7,659 casks runtime from hours to ~7 minutes"
  - "Added AWS SSO profile support via fromSSO() — allows developers using AWS SSO to avoid static credentials"
  - "On-demand inference (not batch) — avoids S3 bucket setup complexity for a one-time job"
  - "Hardcoded region to us-east-1 (removed AWS_REGION env requirement to simplify setup)"

patterns-established:
  - "AWS Bedrock Nova Micro: use inferenceConfig.maxTokens (not max_tokens), content array format"
  - "Credential resolution: check AWS_PROFILE first, fall back to AWS_ACCESS_KEY_ID/SECRET"

requirements-completed:
  - BRWS-02

# Metrics
duration: 2 days (iterative fixes)
completed: 2026-05-27
---

# Phase 04-04: ML Categorization Script Summary

**Amazon Nova Micro parallel batch categorization script (~$0.14 total, ~7 min for 7,659 casks) with AWS SSO support**

## Performance

- **Duration:** 2 days (iterative fixes to model format and credentials)
- **Started:** 2026-05-25
- **Completed:** 2026-05-27
- **Tasks:** 2 (1 auto, 1 human-verify checkpoint — approved)
- **Files modified:** 3 (scripts/categorize-casks.ts, package.json, .env.example)

## Accomplishments
- One-time ML categorization script (`scripts/categorize-casks.ts`) using AWS Bedrock on-demand inference
- Switched to Amazon Nova Micro — ~200x cheaper than Claude Haiku for single-label classification
- Parallel batches of 20 concurrent Bedrock calls — reduces full catalog runtime to ~7 minutes
- AWS SSO profile support via `fromSSO()` — no static credentials required for SSO-configured environments
- Human verification checkpoint completed: script approved after successful categorization run

## Task Commits

1. **Task 1: Create AWS Bedrock categorization script** - `c8fd77e` (fix: switch model to Nova Micro, add SSO)
2. **Task 1 fix: Parallel batch execution** - `2306577` (fix: parallel batches of 20, verbose per-item logging)
3. **Checkpoint: Human verification** - approved by user 2026-05-27

## Files Created/Modified
- `scripts/categorize-casks.ts` — ML categorization script (322 lines): fetches uncategorized casks, sends to Bedrock Nova Micro in parallel batches, updates category column, calls `revalidateTag('casks')`
- `package.json` — added `@aws-sdk/client-bedrock-runtime` and `@aws-sdk/credential-providers`
- `.env.example` — documented AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY with instructions

## Decisions Made
- **Nova Micro over Claude Haiku**: ~$0.14 total vs ~$30 for single-label classification — no quality tradeoff for a fixed 10-category taxonomy
- **Parallel batches of 20**: `Promise.allSettled` over sequential calls — 7 min vs estimated hours for 7,659 casks
- **SSO credential support**: Many devs use AWS SSO profiles; `fromSSO()` via `AWS_PROFILE` avoids friction
- **On-demand over batch**: S3 setup complexity not justified for a one-time job

## Deviations from Plan

### Auto-fixed Issues

**1. Model format mismatch — Nova Micro vs Claude Haiku**
- **Found during:** Task 1 initial run
- **Issue:** Plan specified `anthropic.claude-3-5-haiku` with Anthropic request format; Nova Micro uses different request/response schema
- **Fix:** Updated to `amazon.nova-micro-v1:0` with `inferenceConfig.maxTokens` and `output.message.content[0].text` response parsing
- **Files modified:** `scripts/categorize-casks.ts`
- **Committed in:** `c8fd77e`

**2. Sequential processing too slow**
- **Found during:** Task 1 test run
- **Issue:** Sequential Bedrock calls for 7,659 casks would take hours
- **Fix:** Parallel batches of 20 with `Promise.allSettled`, DB flush after each batch
- **Files modified:** `scripts/categorize-casks.ts`
- **Committed in:** `2306577`

---

**Total deviations:** 2 auto-fixed (model format, performance)
**Impact on plan:** Both fixes improved correctness and speed. No scope creep.

## Issues Encountered
- Nova Micro request/response format differs significantly from Claude models — required reading AWS Nova Micro docs to get correct schema

## User Setup Required

To run categorization:
1. Configure AWS credentials in `.env` (see `.env.example`)
2. Ensure IAM role has `bedrock:InvokeModel` for `amazon.nova-micro-v1:0`
3. Run: `npx tsx scripts/categorize-casks.ts`

## Next Phase Readiness
- Category column populated in database — browse page category filters (`04-02`) functional
- ISR cache invalidated after categorization run
- No blockers for Phase 05

## Self-Check: PASSED

---
*Phase: 04-discovery-layer*
*Completed: 2026-05-27*
