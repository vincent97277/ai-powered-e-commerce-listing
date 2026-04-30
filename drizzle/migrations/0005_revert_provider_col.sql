-- ============================================================
-- 0005_revert_provider_col.sql — Revert V1.5 Track A1 (Gemini swap)
-- 目的: 商家實測 Gemini 不可用, V1.5 收回 OpenAI-only。
--       把 0004 加的 import_sessions.provider 欄位拔掉。
-- 設計: DROP COLUMN IF EXISTS → idempotent, 重跑 OK
-- ============================================================

ALTER TABLE import_sessions DROP COLUMN IF EXISTS provider;
