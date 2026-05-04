/**
 * V2 per-merchant auth — HMAC-bound session helpers (task 103, mirrors V1 admin-session).
 *
 * Cookie 格式: `{sessionId}.{HMAC-SHA256(sessionId, MERCHANT_SESSION_SECRET)}`
 * Server-side validate:
 *   1. HMAC 簽章 timing-safe match
 *   2. merchant_sessions row 存在
 *   3. expires_at > now()
 *   4. revoked_at IS NULL          ← V2 only (admin uses DELETE row 即 revoke; merchant 用 UPDATE)
 *
 * Login flow (loginMerchant):
 *   - Lowercase-normalize email
 *   - bcrypt.compare 對 password
 *   - Constant-time-ish: miss 也跑一次 bcrypt 對 fake hash 防 username enumeration
 *   - 拒 suspended_at != null ("已被停權")
 *   - 拒 approved_at IS NULL ("等待 admin 審核")
 *   - INSERT merchant_sessions row, 簽 cookie 回傳
 *
 * 不能在 middleware import (用 dbAdmin / Node crypto). middleware 用 merchant-session-edge.ts.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { compare as bcryptCompare } from 'bcryptjs';
import { dbAdmin } from '@/db/admin-only';
import { merchantSessions, merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const MERCHANT_SESSION_COOKIE = 'merchant-session';
export const MERCHANT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * bcrypt fake hash 給 username enumeration 防護用 — 必須是合法 bcrypt format 才不會
 * 立即 reject (compareSync 收到非 bcrypt 字串會 short-circuit, 失去 constant-time 意義).
 *
 * 這是 cost=10 對 "" 字串的合法 bcrypt hash, 形狀正確 → bcryptCompare 會跑滿 1024 rounds.
 * 任何 plaintext 對它都不會 match (因為 salt + hash 跟空字串綁定).
 */
const FAKE_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6e1Y1h9D3BaLWl7CLp6h3F7DqU0i';

/** 確保 env 有設, 缺/太短即拋 (middleware 會捕捉並回 503) */
function requireEnv(): { secret: Buffer } {
  const secretRaw = process.env.MERCHANT_SESSION_SECRET;
  if (!secretRaw) throw new Error('MERCHANT_SESSION_SECRET 未設定');
  if (secretRaw.length < 32) {
    throw new Error('MERCHANT_SESSION_SECRET 太短 (≥ 32 chars). 用 openssl rand -hex 32 產一個');
  }
  return { secret: Buffer.from(secretRaw, 'utf8') };
}

/** 簽 cookie value: `{sessionId}.{hmac}` */
export function signSessionCookie(sessionId: string): string {
  const { secret } = requireEnv();
  const hmac = createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${hmac}`;
}

/**
 * 驗 cookie value 簽章 (HMAC). 不查 DB.
 * 回 sessionId 或 null. constant-time compare.
 */
export function verifyCookieSignature(cookieValue: string | undefined): string | null {
  if (!cookieValue) return null;
  const dot = cookieValue.indexOf('.');
  if (dot < 0) return null;
  const sessionId = cookieValue.slice(0, dot);
  const providedMac = cookieValue.slice(dot + 1);
  if (!sessionId || !providedMac) return null;

  let expected: string;
  try {
    const { secret } = requireEnv();
    expected = createHmac('sha256', secret).update(sessionId).digest('hex');
  } catch {
    return null;
  }

  // hex 長度先比 (timingSafeEqual buffer 不同長會丟錯)
  if (providedMac.length !== expected.length) return null;
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(providedMac, 'hex');
    b = Buffer.from(expected, 'hex');
  } catch {
    return null;
  }
  if (a.length === 0 || a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return sessionId;
}

/**
 * Validate cookie + DB row 存在 + 未過期 + 未 revoke. 回 { sessionId, merchantId } 或 null.
 *
 * 這是 layout-level "E11 defense-in-depth" check: middleware 只做純 crypto, 真正的
 * row liveness 必須 server-component 內 query DB. revoked_at 也必須在這層擋
 * (middleware Edge runtime 沒 DB).
 */
export async function validateMerchantSession(
  cookieValue: string | undefined,
): Promise<{ sessionId: string; merchantId: string } | null> {
  const sessionId = verifyCookieSignature(cookieValue);
  if (!sessionId) return null;
  const rows = await dbAdmin
    .select({
      merchantId: merchantSessions.merchantId,
      expiresAt: merchantSessions.expiresAt,
      revokedAt: merchantSessions.revokedAt,
    })
    .from(merchantSessions)
    .where(eq(merchantSessions.id, sessionId))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.revokedAt !== null) return null;
  if (row.expiresAt.getTime() <= Date.now()) return null;
  return { sessionId, merchantId: row.merchantId };
}

/**
 * Login: verify email + password, create session, return signed cookie value.
 *
 * 失敗會回 { success: false, error } — error 已 i18n (繁中) 給 UI 直接顯示.
 *
 * 安全: username enumeration 防護 — email 沒對到也跑一次 bcrypt.compare 對 fake hash.
 * suspended/pending 是 *post-credential* check (帳密對才檢查狀態), 否則隨便 POST 任何 email
 * 都能拿到 "已停權" / "等待審核" 訊息 → 變相 username enumeration leak.
 */
export async function loginMerchant(
  email: string,
  password: string,
  opts: { ip?: string; userAgent?: string } = {},
): Promise<
  | { success: true; cookieValue: string; expiresAt: Date; sessionId: string; merchantId: string }
  | { success: false; error: string }
> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !password) {
    // 空 input 也跑一次 fake bcrypt 維持 timing
    await bcryptCompare(password || 'x', FAKE_BCRYPT_HASH);
    return { success: false, error: '帳號或密碼不正確' };
  }

  const rows = await dbAdmin
    .select({
      id: merchants.id,
      passwordHash: merchants.passwordHash,
      suspendedAt: merchants.suspendedAt,
      approvedAt: merchants.approvedAt,
    })
    .from(merchants)
    .where(eq(merchants.email, normalizedEmail))
    .limit(1);

  const m = rows[0];
  // 即使 m 不存在或沒 hash 也跑 bcrypt 防 enumeration
  const hashToCheck = m?.passwordHash ?? FAKE_BCRYPT_HASH;
  let passOk = false;
  try {
    passOk = await bcryptCompare(password, hashToCheck);
  } catch {
    passOk = false;
  }

  if (!m || !m.passwordHash || !passOk) {
    return { success: false, error: '帳號或密碼不正確' };
  }

  // 帳密過了, 才檢查 status — 不會洩漏 "此 email 存在但被停權" 給陌生 attacker
  if (m.suspendedAt !== null) {
    return { success: false, error: '此帳號已被平台停權' };
  }
  if (m.approvedAt === null) {
    return { success: false, error: '此帳號正在等待 admin 審核' };
  }

  // Create session
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + MERCHANT_SESSION_DURATION_MS);
  await dbAdmin.insert(merchantSessions).values({
    id: sessionId,
    merchantId: m.id,
    expiresAt,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });

  return {
    success: true,
    cookieValue: signSessionCookie(sessionId),
    expiresAt,
    sessionId,
    merchantId: m.id,
  };
}

/**
 * Logout: 設 revoked_at = now(). 不 DELETE row (保 audit trail, V2.1 "全部裝置登出" UI 要列).
 * Idempotent — revoke 已 revoke 過的 session 也不會炸 (UPDATE 不存在 row 就 no-op).
 */
export async function revokeMerchantSession(sessionId: string): Promise<void> {
  await dbAdmin
    .update(merchantSessions)
    .set({ revokedAt: new Date() })
    .where(eq(merchantSessions.id, sessionId));
}
