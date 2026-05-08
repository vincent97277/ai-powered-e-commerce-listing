-- ============================================================
-- 0006_ai_usage_events.sql — V1.5 smoke fix: sync vision calls also count toward cost cap
--
-- Why:
--   /api/products/generate (sync photo upload) calls OpenAI vision and gets usage,
--   but had nowhere to write it → DailyCostChip only looked at import_sessions
--   and always showed NT$0.
--
-- Solution:
--   Every AI call (sync or async) INSERTs a row into ai_usage_events.
--   getDailyCostCents now sums both import_sessions and ai_usage_events.
--
-- RLS pattern (aligned with 0001/0003):
--   - GRANT SELECT, INSERT to web_anon (no UPDATE/DELETE — append-only audit log)
--   - ENABLE + FORCE RLS
--   - tenant_isolation: tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
--   - web_admin BYPASSRLS passes through automatically
--
-- Design notes:
--   - Don't store cost_cents — pricing changes; compute centrally in ai-cost.ts.
--   - source uses text, not an enum — V2 may add new sources (e.g. tiktok_import); avoid re-migrating.
--   - model column reserved for future multi-model support (V1.5 hardcodes gpt-4o-2024-11-20).
-- ============================================================

CREATE TABLE IF NOT EXISTS ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  source text NOT NULL,  -- 'photo_upload' | 'ig_import' | 'shopee_import' | other
  model text NOT NULL DEFAULT 'gpt-4o-2024-11-20',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_events_tenant_created_idx
  ON ai_usage_events (tenant_id, created_at DESC);

-- ─── GRANT (same pattern as 0003) ───
GRANT SELECT, INSERT ON ai_usage_events TO web_anon;
GRANT ALL ON ai_usage_events TO web_admin;

-- ─── RLS ───
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_usage_events
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
