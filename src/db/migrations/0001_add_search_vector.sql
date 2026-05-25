-- Migration: Add full-text search vector column and GIN index to casks table
-- Phase 03-01: search-security / tsvector foundation
-- Applied: 2026-05-25
-- Note: casks table was created in Phase 01 (data-pipeline) without migration history.
--       This migration adds the search_vector generated column and GIN index.

ALTER TABLE "casks"
ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("name", '') || ' ' || coalesce("description", ''))) STORED;

CREATE INDEX "idx_casks_search_vector" ON "casks" USING gin ("search_vector");
