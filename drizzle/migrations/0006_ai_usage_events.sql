-- ============================================================
-- 0006_ai_usage_events.sql — V1.5 smoke fix: 同步 vision call 也算 cost cap
--
-- Why:
--   /api/products/generate (sync photo upload) 會打 OpenAI vision, 拿到 usage
--   但沒地方寫 → DailyCostChip 永遠看 import_sessions, 顯示 NT$0
--
-- Solution:
--   每 AI call (sync 或 async) 都 INSERT 一行到 ai_usage_events
--   getDailyCostCents 改成 import_sessions + ai_usage_events 雙表加總
--
-- RLS pattern (對齊 0001/0003):
--   - GRANT SELECT, INSERT to web_anon (不需要 UPDATE/DELETE — append-only audit log)
--   - ENABLE + FORCE RLS
--   - tenant_isolation: tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
--   - web_admin BYPASSRLS 自動穿透
--
-- 設計考量:
--   - 不存 cost_cents — pricing 可能變, 在 ai-cost.ts 集中算
--   - source 欄位用 text 不上 enum — V2 可能加新 source (eg. tiktok_import) 不想再 migrate
--   - model 欄位預埋, 將來 multi-model 才用得到 (V1.5 寫死 gpt-4o-2024-11-20)
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

-- ─── GRANT (跟 0003 同 pattern) ───
GRANT SELECT, INSERT ON ai_usage_events TO web_anon;
GRANT ALL ON ai_usage_events TO web_admin;

-- ─── RLS ───
ALTER TABLE ai_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_events FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON ai_usage_events
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
