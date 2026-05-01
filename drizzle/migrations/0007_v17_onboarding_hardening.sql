-- ============================================================
-- 0007_v17_onboarding_hardening.sql — V1.7 D1 onboarding security hardening
--
-- Why:
--   /onboarding 之前 V1 簡化版本: 沒 email 驗證 / 沒 captcha / 沒 IP rate limit /
--   沒 reserved slug / 直接 set cookie 進後台. Codex 在 V1.5 + V1.6 review 兩次
--   flag 為最大 security debt.
--
--   V1.7 D1 不引入第三方 (Resend / hCaptcha) 的前提下做到「safe by default」:
--     1. Admin approval queue: 新商家 approved_at=NULL → admin 必須核可才能跑
--     2. Reserved slug list: 在 application layer 擋 (admin/api/store/...)
--     3. IP rate limit (DB-backed, 不引 Redis): 1 success per IP / 24h
--     4. Honeypot: hidden 欄位被 bot 填 → fake-success, 浪費 bot 時間
--
-- 本 migration 涵蓋 1 + 3 (schema 部分):
--   - merchants 加 approved_at + approved_by_admin
--   - 既有商家 backfill approved_at = created_at, approved_by_admin = 'legacy'
--   - 新表 onboarding_attempts 追 IP + slug + 結果 (admin observability)
--
-- RLS pattern (對齊 0001/0003/0006):
--   - onboarding_attempts 只給 web_admin (cross-tenant observability), web_anon 不 GRANT
--   - ENABLE RLS, 沒 policy = deny-all-to-non-superuser (web_admin BYPASSRLS 自動穿透)
-- ============================================================

-- ─── 1. merchants approval columns ───
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS approved_by_admin text;
  -- nullable, V1 admin session id (uuid) or 'legacy' for V1/V1.6 backfill or 'system' for seed

-- Backfill: 既有商家 (V1 demo + V1.6 之前自助註冊) 全部視同已核可,
-- 不然 storefront 會立刻 404 / suspended.
UPDATE merchants
   SET approved_at = created_at,
       approved_by_admin = 'legacy'
 WHERE approved_at IS NULL;

-- 給 admin queue 用: 篩 unapproved merchants 速度
CREATE INDEX IF NOT EXISTS merchants_pending_approval_idx
  ON merchants (created_at DESC)
  WHERE approved_at IS NULL;

-- ─── 2. onboarding_attempts ───
CREATE TABLE IF NOT EXISTS onboarding_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address text NOT NULL,
  slug_attempted text NOT NULL,
  result text NOT NULL CHECK (
    result IN ('success', 'rate_limited', 'invalid_slug', 'reserved_slug', 'honeypot', 'duplicate_slug')
  ),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS onboarding_attempts_ip_created_idx
  ON onboarding_attempts (ip_address, created_at DESC);

-- ─── 3. RLS: deny all to web_anon, web_admin only (admin observability) ───
ALTER TABLE onboarding_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_attempts FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON onboarding_attempts TO web_admin;
-- 故意不 GRANT to web_anon; 配合 RLS ENABLE 即等於 deny-all.
