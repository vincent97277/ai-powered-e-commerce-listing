-- ============================================================
-- Rollback for 0005_revert_provider_col.sql
-- 把 import_sessions.provider 加回來 (default 'openai' 對齊 revert 後狀態)
-- ============================================================

ALTER TABLE import_sessions ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'openai';
