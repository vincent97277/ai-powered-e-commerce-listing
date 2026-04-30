-- ============================================================
-- 0004_v15_provider_col.sql — V1.5 Track A1: import_sessions.provider
-- 目的: 紀錄該次 import 走哪個 vision provider (gemini/openai)
--       供未來 cost-by-provider 報表 + debug 用
-- 前置條件: 0002_low_wonder_man.sql 已建 import_sessions
-- 設計: ADD COLUMN IF NOT EXISTS (Postgres 9.6+) → idempotent, 重跑 OK
-- ============================================================

ALTER TABLE import_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gemini';
