-- ============================================================
-- Rollback for 0005_revert_provider_col.sql
-- Re-add import_sessions.provider (default 'openai' to align with post-revert state).
-- ============================================================

ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
