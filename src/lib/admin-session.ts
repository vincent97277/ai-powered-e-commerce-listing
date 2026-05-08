/**
 * Admin login HMAC-bound session helpers (V1 #43, RA11)
 *
 * Cookie format: `{sessionId}.{HMAC-SHA256(sessionId, ADMIN_SESSION_SECRET)}`
 * Server-side: matches against admin_sessions row (id = sessionId UUID), valid = row exists AND expiresAt > now()
 * Revoke = DELETE admin_sessions row
 *
 * Constant-time compare to prevent timing attacks: both password and HMAC use timingSafeEqual
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { dbAdmin } from '@/db/admin-only';
import { adminSessions } from '@/db/schema';
import { and, eq, gt, lt } from 'drizzle-orm';

export const ADMIN_SESSION_COOKIE = 'admin-session';
export const ADMIN_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24hr

/** Ensure env vars are set; throw if any is missing (middleware catches and returns 503) */
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

/** Constant-time password compare. Use HMAC to flatten input/expected to fixed length, then timingSafeEqual */
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

/** Sign cookie value: `{sessionId}.{hmac}` */
export function signSessionCookie(sessionId: string): string {
  const { secret } = requireEnv();
  const hmac = createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${hmac}`;
}

/**
 * Verify cookie value signature. Doesn't hit DB.
 * Returns sessionId or null
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

/** Create a new session: insert into admin_sessions table, return signed cookie value */
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
 * Verify cookie + check DB session row is not expired. Returns sessionId or null.
 * Two-stage check:
 *   1. HMAC signature matches (constant-time)
 *   2. admin_sessions row exists AND expiresAt > now()
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

/** Cleanup expired sessions (V1 doesn't run cron, manual or V2 cron) */
export async function cleanupExpiredSessions(): Promise<void> {
  await dbAdmin.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
}
