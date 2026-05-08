-- ============================================================
-- 0005_revert_provider_col.sql — Revert V1.5 Track A1 (Gemini swap)
-- Purpose: merchant testing showed Gemini unusable; V1.5 reverts to OpenAI-only.
--          Remove the import_sessions.provider column added in 0004.
-- Design: DROP COLUMN IF EXISTS — idempotent, safe to rerun.
-- ============================================================

ALTER TABLE import_sessions DROP COLUMN IF EXISTS provider;
