/**
 * Admin auth gate e2e (V1 #46, RA11)
 * Tests:
 *   - verifyAdminPassword constant-time compare
 *   - signSessionCookie / verifyCookieSignature roundtrip
 *   - HMAC tampering rejection
 *   - Empty/malformed cookie rejection
 *   - createAdminSession → validateAdminSession DB roundtrip
 *   - Expired session rejection
 *   - revokeAdminSession kills session
 *   - HTTP 5 scenarios (middleware level — fetch against dev server)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADMIN_SESSION_COOKIE,
  createAdminSession,
  revokeAdminSession,
  signSessionCookie,
  validateAdminSession,
  verifyAdminPassword,
  verifyCookieSignature,
} from '@/lib/admin-session';
import { dbAdmin } from '@/db/admin-only';
import { adminSessions } from '@/db/schema';
import { eq, lt, sql } from 'drizzle-orm';
import { verifyCookieSignatureEdge } from '@/lib/admin-session-edge';

// Ensure ADMIN_PASSWORD / SECRET both present (loaded from .env.local)
beforeAll(() => {
  if (!process.env.ADMIN_PASSWORD || !process.env.ADMIN_SESSION_SECRET) {
    throw new Error('admin-auth e2e 需要 ADMIN_PASSWORD + ADMIN_SESSION_SECRET');
  }
});

// Clean up test sessions
afterAll(async () => {
  await dbAdmin.delete(adminSessions).where(sql`ip = 'test-suite'`);
});

describe('admin auth — pure crypto', () => {
  it('verifyAdminPassword: 對密碼 → true', () => {
    const correct = process.env.ADMIN_PASSWORD!;
    expect(verifyAdminPassword(correct)).toBe(true);
  });

  it('verifyAdminPassword: 錯密碼 → false', () => {
    expect(verifyAdminPassword('wrong-password')).toBe(false);
    expect(verifyAdminPassword('')).toBe(false);
    expect(verifyAdminPassword('a')).toBe(false);
  });

  it('signSessionCookie + verifyCookieSignature roundtrip', () => {
    const sid = '11111111-1111-1111-1111-111111111111';
    const cookie = signSessionCookie(sid);
    expect(cookie.startsWith(`${sid}.`)).toBe(true);
    expect(verifyCookieSignature(cookie)).toBe(sid);
  });

  it('verifyCookieSignature 拒篡改 HMAC', () => {
    const sid = '22222222-2222-2222-2222-222222222222';
    const cookie = signSessionCookie(sid);
    // Modify the last byte
    const tampered = cookie.slice(0, -2) + (cookie.endsWith('00') ? '11' : '00');
    expect(verifyCookieSignature(tampered)).toBe(null);
  });

  it('verifyCookieSignature 拒空/缺格式', () => {
    expect(verifyCookieSignature(undefined)).toBe(null);
    expect(verifyCookieSignature('')).toBe(null);
    expect(verifyCookieSignature('no-dot-here')).toBe(null);
    expect(verifyCookieSignature('.empty-id')).toBe(null);
    expect(verifyCookieSignature('id.')).toBe(null);
  });

  it('verifyCookieSignatureEdge (middleware 用) 同 Node 版回相同結果', async () => {
    const sid = '33333333-3333-3333-3333-333333333333';
    const cookie = signSessionCookie(sid);
    const result = await verifyCookieSignatureEdge(cookie, process.env.ADMIN_SESSION_SECRET);
    expect(result).toBe(sid);

    const tampered = cookie.slice(0, -2) + 'ff';
    const tamperedResult = await verifyCookieSignatureEdge(
      tampered,
      process.env.ADMIN_SESSION_SECRET,
    );
    expect(tamperedResult).toBe(null);
  });
});

describe('admin auth — DB-coupled session lifecycle', () => {
  it('createAdminSession → validateAdminSession 回 sessionId', async () => {
    const { cookieValue, sessionId, expiresAt } = await createAdminSession({ ip: 'test-suite' });
    expect(cookieValue).toContain('.');
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const validated = await validateAdminSession(cookieValue);
    expect(validated).toBe(sessionId);
  });

  it('validateAdminSession 拒未存在 session (DB row 缺)', async () => {
    // Sign a cookie but don't write to DB
    const fake = signSessionCookie('99999999-9999-9999-9999-999999999999');
    const validated = await validateAdminSession(fake);
    expect(validated).toBe(null);
  });

  it('validateAdminSession 拒過期 session', async () => {
    const { cookieValue, sessionId } = await createAdminSession({ ip: 'test-suite' });
    // Manually set expiresAt to the past
    await dbAdmin
      .update(adminSessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(adminSessions.id, sessionId));

    const validated = await validateAdminSession(cookieValue);
    expect(validated).toBe(null);
  });

  it('revokeAdminSession 立刻失效', async () => {
    const { cookieValue, sessionId } = await createAdminSession({ ip: 'test-suite' });
    expect(await validateAdminSession(cookieValue)).toBe(sessionId);

    await revokeAdminSession(sessionId);

    expect(await validateAdminSession(cookieValue)).toBe(null);
  });
});

describe('admin auth — HTTP integration (middleware /admin gate)', () => {
  const BASE = 'http://localhost:3000';

  // Dev server must be running first (bun run dev). Skip if unreachable.
  beforeAll(async () => {
    try {
      await fetch(`${BASE}/`);
    } catch {
      console.warn('skip middleware HTTP tests: dev server not running (bun run dev)');
    }
  });

  async function tryFetch(path: string, init?: RequestInit) {
    try {
      return await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
    } catch {
      return null;
    }
  }

  it('GET /admin 沒 cookie → 307 redirect to /admin/login?next=/admin', async () => {
    const r = await tryFetch('/admin');
    if (!r) return;
    expect(r.status).toBe(307);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/admin/login');
    expect(location).toContain('next=%2Fadmin');
  });

  it('GET /admin/login 不擋 → 200', async () => {
    const r = await tryFetch('/admin/login');
    if (!r) return;
    expect(r.status).toBe(200);
  });

  it('GET /admin 帶亂 cookie (HMAC 不對) → 307 redirect', async () => {
    const r = await tryFetch('/admin', {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=fake-session-id.deadbeef` },
    });
    if (!r) return;
    expect(r.status).toBe(307);
  });

  it('GET /admin 帶簽好的 cookie 但 DB row 不存在 → layout 檔住 → 307 redirect (V1.6 E11)', async () => {
    // Sign a cookie with valid HMAC but no matching admin_sessions row in DB.
    // Middleware's pure crypto check lets it through, but (admin)/layout.tsx's validateAdminSession
    // finds no DB row → redirect to /admin/login. Core guarantee fixed by E11.
    const sid = '44444444-4444-4444-4444-444444444444';
    const cookie = signSessionCookie(sid);
    const r = await tryFetch('/admin', {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookie}` },
    });
    if (!r) return;
    expect(r.status).toBe(307);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/admin/login');
  });

  it('V1.6 E11: revoked session — HMAC 對但 DB row 沒了 → layout redirect to /admin/login', async () => {
    // 1. Create a valid session (DB row written + HMAC-signed cookie)
    const { cookieValue, sessionId } = await createAdminSession({ ip: 'test-suite' });

    // 2. Middleware HMAC passes, layout DB check passes → should not be 307
    const before = await tryFetch('/admin', {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookieValue}` },
    });
    if (!before) return; // Skip HTTP portion if dev server not running
    expect(before.status).not.toBe(307);

    // 3. Revoke (DELETE row) — cookie HMAC still valid, but DB row gone
    await revokeAdminSession(sessionId);

    // 4. Hit again: middleware still passes (pure crypto), but layout's validateAdminSession returns null → redirect
    const after = await tryFetch('/admin', {
      headers: { cookie: `${ADMIN_SESSION_COOKIE}=${cookieValue}` },
    });
    if (!after) return;
    expect(after.status).toBe(307);
    const location = after.headers.get('location') ?? '';
    expect(location).toContain('/admin/login');
  });
});

// Cleanup any expired test sessions left over
afterAll(async () => {
  await dbAdmin.delete(adminSessions).where(lt(adminSessions.expiresAt, new Date()));
});
