-- ============================================================
-- Rollback for 0004_v15_provider_col.sql
-- Design: DROP COLUMN IF EXISTS — idempotent, safe to rerun.
-- Warning: running this rollback drops all historical import_sessions provider records.
-- ============================================================

ALTER TABLE import_sessions
  DROP COLUMN IF EXISTS provider;
