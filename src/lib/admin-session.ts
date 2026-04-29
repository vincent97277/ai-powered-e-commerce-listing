/**
 * Admin login HMAC-bound session helpers (V1 #43, RA11)
 *
 * Cookie 格式: `{sessionId}.{HMAC-SHA256(sessionId, ADMIN_SESSION_SECRET)}`
 * Server-side: 對應 admin_sessions row (id = sessionId UUID), valid = row 存在 AND expiresAt > now()
 * Revoke = DELETE admin_sessions row
 *
 * Constant-time compare 防 timing attack: password 跟 HMAC 都用 timingSafeEqual
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { dbAdmin } from '@/db/admin-only';
import { adminSessions } from '@/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';

export const ADMIN_SESSION_COOKIE = 'admin-session';
export const ADMIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24hr

/** 確保 env 都有設, 缺一即拋 (middleware 會捕捉並回 503) */
function requireEnv(): { password: string; secret: Buffer } {
  const password = process.env.ADMIN_PASSWORD;
  const secretRaw = process.env.ADMIN_SESSION_SECRET;
  if (!password) throw new Error('ADMIN_PASSWORD 未設定');
  if (!secretRaw) throw new Error('ADMIN_SESSION_SECRET 未設定');
  if (secretRaw.length < 32) {
    throw new Error('ADMIN_SESSION_SECRET 太短 (≥ 32 chars). 用 openssl rand -hex 32 產一個');
  }
  return { password, secret: Buffer.from(secretRaw, 'utf8') };
}

/** Constant-time password compare. 用 HMAC 把 input/expected 都展平到固定長度後 timingSafeEqual */
export function verifyAdminPassword(input: string): boolean {
  try {
    const { password } = requireEnv();
    const a = createHmac('sha256', '_').update(input).digest();
    const b = createHmac('sha256', '_').update(password).digest();
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/** 簽 cookie value: `{sessionId}.{hmac}` */
export function signSessionCookie(sessionId: string): string {
  const { secret } = requireEnv();
  const hmac = createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${hmac}`;
}

/**
 * 驗 cookie value 簽章. 不查 DB.
 * 回 sessionId 或 null
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

  const a = Buffer.from(providedMac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length === 0 || a.length !== b.length) return null;
  if (!timingSafeEqual(a, b)) return null;
  return sessionId;
}

/** 建新 session: 寫入 admin_sessions table, 回 signed cookie value */
export async function createAdminSession(opts: { ip?: string; userAgent?: string }): Promise<{
  cookieValue: string;
  expiresAt: Date;
  sessionId: string;
}> {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_DURATION_MS);
  await dbAdmin.insert(adminSessions).values({
    id: sessionId,
    expiresAt,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });
  return { cookieValue: signSessionCookie(sessionId), expiresAt, sessionId };
}

/**
 * 驗 cookie + 查 DB session row 未過期. 回 sessionId 或 null.
 * 兩段檢查:
 *   1. HMAC 簽章對 (constant-time)
 *   2. admin_sessions row 存在 AND expiresAt > now()
 */
export async function validateAdminSession(cookieValue: string | undefined): Promise<string | null> {
  const sessionId = verifyCookieSignature(cookieValue);
  if (!sessionId) return null;
  const rows = await dbAdmin
    .select({ id: adminSessions.id })
    .from(adminSessions)
    .where(and(eq(adminSessions.id, sessionId), gt(adminSessions.expiresAt, new Date())))
    .limit(1);
  if (rows.length === 0) return null;
  return sessionId;
}

/** Revoke (logout): DELETE row */
export async function revokeAdminSession(sessionId: string): Promise<void> {
  await dbAdmin.delete(adminSessions).where(eq(adminSessions.id, sessionId));
}

/** Cleanup expired sessions (V1 不跑 cron, 手動或 V2 cron) */
export async function cleanupExpiredSessions(): Promise<void> {
  await dbAdmin.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
}
