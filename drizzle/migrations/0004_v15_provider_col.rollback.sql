-- ============================================================
-- Rollback for 0004_v15_provider_col.sql
-- 設計: DROP COLUMN IF EXISTS → idempotent, 重跑 OK
-- 警告: 跑 rollback 會刪掉所有歷史 import_sessions 的 provider 紀錄
-- ============================================================

ALTER TABLE import_sessions
  DROP COLUMN IF EXISTS provider;
