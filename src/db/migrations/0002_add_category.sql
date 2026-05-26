-- Migration: Add category column for discovery filtering
-- Phase 04: discovery-layer / category filtering
-- Applied: 2026-05-26
-- Note: Category populated during sync pipeline enrichment via AWS Bedrock ML categorization.
--       Nullable during initial rollout; uncategorized casks remain NULL.

ALTER TABLE "casks" ADD COLUMN "category" text;

CREATE INDEX "idx_casks_category" ON "casks" ("category");
