-- ============================================================
-- 0004_v15_provider_col.sql — V1.5 Track A1: import_sessions.provider
-- Purpose: record which vision provider each import used (gemini/openai)
--          for future cost-by-provider reports + debug.
-- Prereq: 0002_low_wonder_man.sql already created import_sessions.
-- Design: ADD COLUMN IF NOT EXISTS (Postgres 9.6+) — idempotent, safe to rerun.
-- ============================================================

ALTER TABLE import_sessions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'gemini';
