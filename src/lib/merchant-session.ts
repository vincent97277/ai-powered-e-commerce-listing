/**
 * V2 per-merchant auth — HMAC-bound session helpers (task 103, mirrors V1 admin-session).
 *
 * Cookie format: `{sessionId}.{HMAC-SHA256(sessionId, MERCHANT_SESSION_SECRET)}`
 * Server-side validate:
 *   1. HMAC signature timing-safe match
 *   2. merchant_sessions row exists
 *   3. expires_at > now()
 *   4. revoked_at IS NULL          ← V2 only (admin uses DELETE row to revoke; merchant uses UPDATE)
 *
 * Login flow (loginMerchant):
 *   - Lowercase-normalize email
 *   - bcrypt.compare against password
 *   - Constant-time-ish: on miss also run bcrypt against fake hash to prevent username enumeration
 *   - Reject suspended_at != null ("已被停權")
 *   - Reject approved_at IS NULL ("等待 admin 審核")
 *   - INSERT merchant_sessions row, sign cookie, return
 *
 * Can't be imported in middleware (uses dbAdmin / Node crypto). Middleware uses merchant-session-edge.ts.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { compare as bcryptCompare } from 'bcryptjs';
import { dbAdmin } from '@/db/admin-only';
import { merchantSessions, merchants } from '@/db/schema';
import { eq } from 'drizzle-orm';

export const MERCHANT_SESSION_COOKIE = 'merchant-session';
export const MERCHANT_SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * bcrypt fake hash for username enumeration protection — must be a valid bcrypt format,
 * otherwise compareSync short-circuits on non-bcrypt strings, losing constant-time semantics.
 *
 * This is a valid cost=10 bcrypt hash of "", shape-correct → bcryptCompare runs the full 1024 rounds.
 * No plaintext will match it (because salt + hash are bound to the empty string).
 */
const FAKE_BCRYPT_HASH = '$2a$10$CwTycUXWue0Thq9StjUM0uJ8.6e1Y1h9D3BaLWl7CLp6h3F7DqU0i';

/** Ensure env is set; throw if missing/too short (middleware catches and returns 503) */
function requireEnv(): { secret: Buffer } {
  const secretRaw = process.env.MERCHANT_SESSION_SECRET;
  if (!secretRaw) throw new Error('MERCHANT_SESSION_SECRET 未設定');
  if (secretRaw.length < 32) {
    throw new Error('MERCHANT_SESSION_SECRET 太短 (≥ 32 chars). 用 openssl rand -hex 32 產一個');
  }
  return { secret: Buffer.from(secretRaw, 'utf8') };
}

/** Sign cookie value: `{sessionId}.{hmac}` */
export function signSessionCookie(sessionId: string): string {
  const { secret } = requireEnv();
  const hmac = createHmac('sha256', secret).update(sessionId).digest('hex');
  return `${sessionId}.${hmac}`;
}

/**
 * Verify cookie value signature (HMAC). Doesn't hit DB.
 * Returns sessionId or null. Constant-time compare.
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

  // Compare hex length first (timingSafeEqual throws on different-length buffers)
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
 * Validate cookie + DB row exists + not expired + not revoked. Returns { sessionId, merchantId } or null.
 *
 * This is the layout-level "E11 defense-in-depth" check: middleware only does pure crypto, real
 * row liveness must be queried in a server-component. revoked_at must also be blocked at this layer
 * (middleware Edge runtime has no DB).
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
 * On failure returns { success: false, error } — error is i18n'd (Trad. Chinese) for direct UI display.
 *
 * Security: username enumeration protection — even if email doesn't match, run bcrypt.compare against fake hash once.
 * suspended/pending are *post-credential* checks (only check status after credentials match); otherwise
 * POSTing any email could yield "suspended" / "awaiting approval" messages → indirect username enumeration leak.
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
    // Empty input also runs fake bcrypt once to keep timing
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
  // Run bcrypt even if m doesn't exist or has no hash, to prevent enumeration
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

  // Only check status after credentials pass — doesn't leak "this email exists but is suspended" to a random attacker
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
 * Logout: set revoked_at = now(). Doesn't DELETE the row (preserves audit trail, V2.1 "log out all devices" UI needs to list it).
 * Idempotent — revoking an already-revoked session doesn't blow up (UPDATE on non-existent row is a no-op).
 */
export async function revokeMerchantSession(sessionId: string): Promise<void> {
  await dbAdmin
    .update(merchantSessions)
    .set({ revokedAt: new Date() })
    .where(eq(merchantSessions.id, sessionId));
}
