-- ============================================================
-- 0008_v2_merchant_auth.sql — V2 per-merchant authentication schema
--
-- Why:
--   V1.7 review side-find: 「商家後台應該每個商家有自己的認證, 而不是共用
--   demo-merchant-id cookie」. V1 的 demo-merchant-id cookie 可以被任何人偽造,
--   等同沒 auth — 只是 slug 對應 tenant 的 lookup, 不是身分驗證.
--
--   V2 改造分四步, 本 migration 只做 schema 部分 (task 102):
--     1. (本檔) merchants 加 email + password_hash 欄位
--     2. 新表 merchant_sessions (mirror admin_sessions, V1 #41 RA11 pattern)
--     3. RLS: web_admin only (跟 admin_sessions, onboarding_attempts 同 pattern)
--     4. 不在此 migration backfill — 改用 scripts/seed-merchant-auth.ts
--        (避免 migration 寫死 bcrypt cost / hash 格式, auth lib 由 task 103 決定)
--
-- Out of scope (task 103 起):
--   - HMAC session cookie 簽章邏輯 (mirror src/lib/admin-session.ts)
--   - bcrypt verify / login UI / middleware DB liveness check
--   - 把現有 demo-merchant-id consumer 全部改去查 merchant_sessions
-- ============================================================

-- ─── 1. merchants auth columns ───
-- email: nullable 因為現有 6+ demo merchants 還沒 email,
--        scripts/seed-merchant-auth.ts 會 backfill.
-- password_hash: nullable (同上). bcrypt $2a$10$… 60 chars, 用 text 不限長度.
ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS password_hash text;

-- Email 必須 unique (when present) 且 case-insensitive — 用 functional unique index
-- partial: WHERE email IS NOT NULL 允許 multi-NULL (現有 demo merchants 還沒填)
-- 這跟 merchants_referral_code_uniq 同 pattern (RA8 partial unique).
CREATE UNIQUE INDEX IF NOT EXISTS merchants_email_unique_idx
  ON merchants (lower(email))
  WHERE email IS NOT NULL;

-- ─── 2. merchant_sessions ───
-- Mirror admin_sessions (0002_low_wonder_man.sql) — 同樣 HMAC cookie + DB liveness check.
-- 加 merchant_id FK + revoked_at (admin_sessions V1 沒有, 但 V2 想 support
-- 「全部裝置登出」用 revoke 比 DELETE 好 audit).
CREATE TABLE IF NOT EXISTS merchant_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Index for merchant 自己列出 active sessions / 撤銷 (settings page V2.1)
-- DESC 因為 UI 永遠顯示最新 session 在最上面.
CREATE INDEX IF NOT EXISTS merchant_sessions_merchant_idx
  ON merchant_sessions (merchant_id, expires_at DESC);

-- ─── 3. RLS: deny all to web_anon, web_admin only ───
-- 跟 onboarding_attempts (0007) / admin_sessions 相同 pattern:
--   - ENABLE + FORCE RLS, 沒 policy = deny-all-to-non-superuser
--   - web_admin BYPASSRLS 自動穿透 (admin observability)
--   - web_anon 故意不 GRANT (defense in depth — middleware 不該查這, 但即使誤查也 leak 不出來)
ALTER TABLE merchant_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE merchant_sessions FORCE  ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON merchant_sessions TO web_admin;
-- 故意不 GRANT to web_anon.
