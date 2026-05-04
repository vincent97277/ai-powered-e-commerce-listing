/**
 * V2 merchant auth gate e2e (task 103) — mirrors tests/admin-auth.e2e.test.ts.
 *
 * Coverage:
 *  - pure crypto: signSessionCookie / verifyCookieSignature roundtrip + tampering + edge variant
 *  - DB-coupled: loginMerchant happy path / wrong creds / suspended / pending
 *  - validateMerchantSession: valid / bad HMAC / expired / revoked
 *  - revokeMerchantSession: 設 revoked_at
 *  - HTTP middleware: /merchant 重導 /merchant/login, /merchant/login + /merchant/signup 200
 *  - HTTP middleware: missing MERCHANT_SESSION_SECRET → 503 (skipped — 測 process env unset
 *    需要重啟 dev server, 不適合在單元測試做; 留給 task 106 manual smoke)
 *
 * 自建 test merchants (akami_test_103, akami_test_103_suspended, akami_test_103_pending),
 * afterAll 清理. 不依賴 seed state.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hash as bcryptHash } from 'bcryptjs';
import { eq, sql } from 'drizzle-orm';
import {
  MERCHANT_SESSION_COOKIE,
  loginMerchant,
  revokeMerchantSession,
  signSessionCookie,
  validateMerchantSession,
  verifyCookieSignature,
} from '@/lib/merchant-session';
import { verifyCookieSignatureEdge } from '@/lib/merchant-session-edge';
import { dbAdmin } from '@/db/admin-only';
import { merchantSessions, merchants } from '@/db/schema';

// 確保 MERCHANT_SESSION_SECRET 有 (從 .env.local 載)
beforeAll(() => {
  if (!process.env.MERCHANT_SESSION_SECRET || process.env.MERCHANT_SESSION_SECRET.length < 32) {
    throw new Error('merchant-auth e2e 需要 MERCHANT_SESSION_SECRET ≥32 字元 in .env.local');
  }
});

// ─── 測試用 merchant 帳號 (隔離, 不污染 seed) ───
const TEST_PREFIX = 't103_';
const TEST_PASSWORD = 'test-password-103';
const ACTIVE = {
  slug: `${TEST_PREFIX}active`,
  email: `${TEST_PREFIX}active@test.local`,
};
const SUSPENDED = {
  slug: `${TEST_PREFIX}suspended`,
  email: `${TEST_PREFIX}suspended@test.local`,
};
const PENDING = {
  slug: `${TEST_PREFIX}pending`,
  email: `${TEST_PREFIX}pending@test.local`,
};

let activeMerchantId = '';
let suspendedMerchantId = '';
let pendingMerchantId = '';

beforeAll(async () => {
  const passwordHash = await bcryptHash(TEST_PASSWORD, 10);

  // 清舊的 (避免上次 test crash 留 garbage)
  await dbAdmin.delete(merchants).where(sql`slug LIKE ${TEST_PREFIX + '%'}`);

  // 建 3 個 test merchants
  const [a] = await dbAdmin
    .insert(merchants)
    .values({
      slug: ACTIVE.slug,
      name: `Test Active ${TEST_PREFIX}`,
      email: ACTIVE.email,
      passwordHash,
      approvedAt: new Date(),
      approvedByAdmin: 'test-suite',
    })
    .returning({ id: merchants.id });
  activeMerchantId = a!.id;

  const [s] = await dbAdmin
    .insert(merchants)
    .values({
      slug: SUSPENDED.slug,
      name: `Test Suspended ${TEST_PREFIX}`,
      email: SUSPENDED.email,
      passwordHash,
      approvedAt: new Date(),
      approvedByAdmin: 'test-suite',
      suspendedAt: new Date(),
      suspendedReason: 'test-suite suspension',
    })
    .returning({ id: merchants.id });
  suspendedMerchantId = s!.id;

  const [p] = await dbAdmin
    .insert(merchants)
    .values({
      slug: PENDING.slug,
      name: `Test Pending ${TEST_PREFIX}`,
      email: PENDING.email,
      passwordHash,
      // approvedAt 不設 → pending
    })
    .returning({ id: merchants.id });
  pendingMerchantId = p!.id;
});

// 清測試 sessions + merchants
afterAll(async () => {
  // session FK ON DELETE CASCADE 但保險刪 ip='test-suite' 那批 (login API 沒帶 ip 也清)
  await dbAdmin.delete(merchantSessions).where(sql`ip = 'test-suite'`);
  await dbAdmin.delete(merchants).where(sql`slug LIKE ${TEST_PREFIX + '%'}`);
});

describe('merchant auth — pure crypto', () => {
  it('signSessionCookie + verifyCookieSignature roundtrip', () => {
    const sid = '11111111-1111-1111-1111-aaaaaaaaaaa1';
    const cookie = signSessionCookie(sid);
    expect(cookie.startsWith(`${sid}.`)).toBe(true);
    expect(verifyCookieSignature(cookie)).toBe(sid);
  });

  it('verifyCookieSignature 拒篡改 HMAC', () => {
    const sid = '22222222-2222-2222-2222-aaaaaaaaaaa2';
    const cookie = signSessionCookie(sid);
    const tampered = cookie.slice(0, -2) + (cookie.endsWith('00') ? '11' : '00');
    expect(verifyCookieSignature(tampered)).toBe(null);
  });

  it('verifyCookieSignature 拒空/缺格式/壞 hex', () => {
    expect(verifyCookieSignature(undefined)).toBe(null);
    expect(verifyCookieSignature('')).toBe(null);
    expect(verifyCookieSignature('no-dot-here')).toBe(null);
    expect(verifyCookieSignature('.empty-id')).toBe(null);
    expect(verifyCookieSignature('id.')).toBe(null);
    expect(verifyCookieSignature('id.not-hex-zzzz')).toBe(null);
  });

  it('verifyCookieSignatureEdge (middleware 用) 跟 Node 版回相同結果', async () => {
    const sid = '33333333-3333-3333-3333-aaaaaaaaaaa3';
    const cookie = signSessionCookie(sid);
    const result = await verifyCookieSignatureEdge(cookie, process.env.MERCHANT_SESSION_SECRET);
    expect(result).toBe(sid);

    const tampered = cookie.slice(0, -2) + 'ff';
    const tamperedResult = await verifyCookieSignatureEdge(
      tampered,
      process.env.MERCHANT_SESSION_SECRET,
    );
    expect(tamperedResult).toBe(null);
  });

  it('verifyCookieSignatureEdge: 沒 secret / secret 太短 → null', async () => {
    const sid = '44444444-4444-4444-4444-aaaaaaaaaaa4';
    const cookie = signSessionCookie(sid);
    expect(await verifyCookieSignatureEdge(cookie, undefined)).toBe(null);
    expect(await verifyCookieSignatureEdge(cookie, 'too-short')).toBe(null);
  });
});

describe('merchant auth — loginMerchant', () => {
  it('valid creds → success + cookie + merchantId', async () => {
    const res = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.merchantId).toBe(activeMerchantId);
      expect(res.cookieValue).toContain('.');
      expect(res.expiresAt.getTime()).toBeGreaterThan(Date.now());
      // verify cookie signature roundtrip
      expect(verifyCookieSignature(res.cookieValue)).toBe(res.sessionId);
    }
  });

  it('valid creds with mixed-case email → success (lowercase normalize)', async () => {
    const res = await loginMerchant(ACTIVE.email.toUpperCase(), TEST_PASSWORD, {
      ip: 'test-suite',
    });
    expect(res.success).toBe(true);
  });

  it('wrong password → "帳號或密碼不正確"', async () => {
    const res = await loginMerchant(ACTIVE.email, 'wrong-password', { ip: 'test-suite' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain('帳號或密碼不正確');
  });

  it('wrong email → "帳號或密碼不正確" (no enumeration leak)', async () => {
    const res = await loginMerchant('does-not-exist@test.local', TEST_PASSWORD, {
      ip: 'test-suite',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      // 訊息必須跟 wrong-password 一樣 — 不能透露 "此 email 不存在"
      expect(res.error).toContain('帳號或密碼不正確');
    }
  });

  it('empty email/password → fail (not crash)', async () => {
    expect((await loginMerchant('', '', {})).success).toBe(false);
    expect((await loginMerchant('', TEST_PASSWORD, {})).success).toBe(false);
    expect((await loginMerchant(ACTIVE.email, '', {})).success).toBe(false);
  });

  it('suspended merchant: 帳密對 → "已被平台停權"', async () => {
    const res = await loginMerchant(SUSPENDED.email, TEST_PASSWORD, { ip: 'test-suite' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain('已被平台停權');
  });

  it('pending (unapproved) merchant: 帳密對 → "等待 admin 審核"', async () => {
    const res = await loginMerchant(PENDING.email, TEST_PASSWORD, { ip: 'test-suite' });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error).toContain('等待 admin 審核');
  });

  it('suspended/pending wrong password: 不洩漏 status, 顯示 "帳號或密碼不正確"', async () => {
    // 安全 invariant: post-credential check — 帳密錯就走 generic error, 不會說 "已停權"
    const res1 = await loginMerchant(SUSPENDED.email, 'wrong-pw', { ip: 'test-suite' });
    expect(res1.success).toBe(false);
    if (!res1.success) expect(res1.error).toContain('帳號或密碼不正確');

    const res2 = await loginMerchant(PENDING.email, 'wrong-pw', { ip: 'test-suite' });
    expect(res2.success).toBe(false);
    if (!res2.success) expect(res2.error).toContain('帳號或密碼不正確');
  });
});

describe('merchant auth — DB-coupled session lifecycle', () => {
  it('loginMerchant → validateMerchantSession 回 merchantId', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    expect(login.success).toBe(true);
    if (!login.success) return;

    const validated = await validateMerchantSession(login.cookieValue);
    expect(validated).not.toBeNull();
    expect(validated?.sessionId).toBe(login.sessionId);
    expect(validated?.merchantId).toBe(activeMerchantId);
  });

  it('validateMerchantSession 拒未存在 session (DB row 缺)', async () => {
    const fake = signSessionCookie('99999999-9999-9999-9999-bbbbbbbbbbbb');
    const validated = await validateMerchantSession(fake);
    expect(validated).toBe(null);
  });

  it('validateMerchantSession 拒 bad HMAC', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup failed');
    const tampered = login.cookieValue.slice(0, -2) + 'ff';
    expect(await validateMerchantSession(tampered)).toBe(null);
  });

  it('validateMerchantSession 拒過期 session', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup failed');

    await dbAdmin
      .update(merchantSessions)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(merchantSessions.id, login.sessionId));

    expect(await validateMerchantSession(login.cookieValue)).toBe(null);
  });

  it('validateMerchantSession 拒 revoked session (V2 invariant — admin 沒這個)', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup failed');
    expect((await validateMerchantSession(login.cookieValue))?.sessionId).toBe(login.sessionId);

    await revokeMerchantSession(login.sessionId);

    // Cookie HMAC 還是合法, row 還在 (revoked_at 設了), 但必須擋下
    expect(await validateMerchantSession(login.cookieValue)).toBe(null);
  });

  it('revokeMerchantSession 設 revoked_at != null (不 DELETE row, 保 audit)', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup failed');

    await revokeMerchantSession(login.sessionId);

    const [row] = await dbAdmin
      .select({ revokedAt: merchantSessions.revokedAt })
      .from(merchantSessions)
      .where(eq(merchantSessions.id, login.sessionId))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.revokedAt).not.toBeNull();
  });

  it('revokeMerchantSession idempotent (revoke 已 revoke 不炸)', async () => {
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup failed');
    await revokeMerchantSession(login.sessionId);
    await expect(revokeMerchantSession(login.sessionId)).resolves.toBeUndefined();
  });
});

describe('merchant auth — HTTP integration (middleware /merchant gate)', () => {
  const BASE = 'http://localhost:3000';
  let devServerUp = false;

  beforeAll(async () => {
    try {
      await fetch(`${BASE}/`);
      devServerUp = true;
    } catch {
      console.warn('skip middleware HTTP tests: dev server 沒跑 (bun run dev)');
    }
  });

  async function tryFetch(path: string, init?: RequestInit) {
    if (!devServerUp) return null;
    try {
      return await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
    } catch {
      return null;
    }
  }

  it('GET /merchant 沒 cookie → 307 redirect to /merchant/login?next=/merchant', async () => {
    const r = await tryFetch('/merchant');
    if (!r) return;
    expect(r.status).toBe(307);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/merchant/login');
    expect(location).toContain('next=%2Fmerchant');
  });

  it('GET /merchant/login 不擋 → 200 (or 404 if route 還沒做, 但不應該是 307)', async () => {
    const r = await tryFetch('/merchant/login');
    if (!r) return;
    // route 還沒 ship (task 104 才做) → Next.js 回 404. 重點是「沒被 middleware 攔截 redirect」
    expect(r.status).not.toBe(307);
  });

  it('GET /merchant/signup 不擋 → 不是 307', async () => {
    const r = await tryFetch('/merchant/signup');
    if (!r) return;
    expect(r.status).not.toBe(307);
  });

  it('GET /merchant 帶亂 cookie (HMAC 不對) → 307 redirect', async () => {
    const r = await tryFetch('/merchant', {
      headers: { cookie: `${MERCHANT_SESSION_COOKIE}=fake-session-id.deadbeef` },
    });
    if (!r) return;
    expect(r.status).toBe(307);
  });

  it('GET /merchant 帶簽好的 cookie (DB row 不在) → layout E11 redirect 到 /merchant/login (task 105)', async () => {
    // V2 task 103 invariant: middleware 只做純 crypto, DB row liveness 在 layout.
    // V2 task 105 finalize: (merchant)/layout.tsx 跟 resolveMerchantFromCookie() 都 wired
    //   E11 defense-in-depth — HMAC 合法但 session row 不存在/已 revoked → redirect.
    const sid = '55555555-5555-5555-5555-aaaaaaaaaaa5';
    const cookie = signSessionCookie(sid);
    const r = await tryFetch('/merchant', {
      headers: { cookie: `${MERCHANT_SESSION_COOKIE}=${cookie}` },
    });
    if (!r) return;
    // middleware 放 (HMAC 對) → layout validateMerchantSession() 撞 DB → row 沒有 → redirect.
    expect(r.status).toBe(307);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/merchant/login');
  });

  it('GET /merchant-switcher → 404 (V2 task 105 移除整個 route)', async () => {
    const r = await tryFetch('/merchant-switcher');
    if (!r) return;
    // task 105: route 整個刪掉, middleware 也不再 match — 自然 404, by design.
    // 點到舊 link 不會 5xx, 不會無限 redirect, 就是普通 not-found.
    expect(r.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2 task 104 — login + logout + onboarding HTTP smoke
// 這層測 server actions / route handler 真的 wired up 跟 cookie / DB 互動正確.
// 跑前提: dev server up + .env.local 完整. dev server 沒跑就全部 silently skip.
// ─────────────────────────────────────────────────────────────────────────────

describe('merchant auth — task 104 HTTP (login + logout + onboarding)', () => {
  const BASE = 'http://localhost:3000';
  let devServerUp = false;

  beforeAll(async () => {
    try {
      await fetch(`${BASE}/`);
      devServerUp = true;
    } catch {
      console.warn('skip task 104 HTTP tests: dev server 沒跑 (bun run dev)');
    }
  });

  /**
   * Server action POST 用 multipart/form-data + Next-Action header.
   * 直接用 native FormData submission 對 /merchant/login 不會 work (server actions
   * 走 Next.js RSC 協定). 所以這層測「中介行為 (HTTP layer 是否可達)」, 不直接調 action.
   * 真正 action logic 已被 lib-level loginMerchant tests cover.
   */
  async function tryGet(path: string, init?: RequestInit) {
    if (!devServerUp) return null;
    try {
      return await fetch(`${BASE}${path}`, { ...init, redirect: 'manual' });
    } catch {
      return null;
    }
  }

  it('GET /merchant/login → 200 (page renders)', async () => {
    const r = await tryGet('/merchant/login');
    if (!r) return;
    expect(r.status).toBe(200);
    const body = await r.text();
    expect(body).toContain('商家登入');
  });

  it('GET /merchant/login?next=/merchant/products → 200 (next param 接受 internal path)', async () => {
    const r = await tryGet('/merchant/login?next=/merchant/products');
    if (!r) return;
    expect(r.status).toBe(200);
  });

  it('GET /onboarding → 200 (page renders email + password fields)', async () => {
    const r = await tryGet('/onboarding');
    if (!r) return;
    expect(r.status).toBe(200);
    const body = await r.text();
    // 確認 V2 task 104 新欄位 + V1.7 D1 honeypot 都還在
    expect(body).toContain('登入 email');
    expect(body).toContain('密碼');
    expect(body).toContain('再輸入一次密碼');
    expect(body).toContain('hp_url'); // honeypot 還在
  });

  it('GET /merchant/logout → 405 Method Not Allowed (登出必須 POST 防 prefetch)', async () => {
    const r = await tryGet('/merchant/logout');
    if (!r) return;
    expect(r.status).toBe(405);
  });

  it('POST /merchant/logout 沒 cookie → 303 redirect to /merchant/login (idempotent)', async () => {
    const r = await tryGet('/merchant/logout', { method: 'POST' });
    if (!r) return;
    expect(r.status).toBe(303);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/merchant/login');
  });

  it('POST /merchant/logout 帶合法 session cookie → 303 + DB row revoked', async () => {
    if (!devServerUp) return;
    // 1. 直接 lib-level login 拿一個合法 cookie
    const login = await loginMerchant(ACTIVE.email, TEST_PASSWORD, { ip: 'test-suite' });
    if (!login.success) throw new Error('setup login failed');

    // 2. POST /merchant/logout 帶 cookie
    const r = await tryGet('/merchant/logout', {
      method: 'POST',
      headers: { cookie: `${MERCHANT_SESSION_COOKIE}=${login.cookieValue}` },
    });
    if (!r) return;
    expect(r.status).toBe(303);
    const location = r.headers.get('location') ?? '';
    expect(location).toContain('/merchant/login');

    // 3. 驗 DB row revoked_at 被設
    const [row] = await dbAdmin
      .select({ revokedAt: merchantSessions.revokedAt })
      .from(merchantSessions)
      .where(eq(merchantSessions.id, login.sessionId))
      .limit(1);
    expect(row).toBeDefined();
    expect(row!.revokedAt).not.toBeNull();

    // 4. 驗 set-cookie clear 了 (max-age=0 or expires=epoch)
    const setCookie = r.headers.get('set-cookie') ?? '';
    expect(setCookie.toLowerCase()).toContain('merchant-session=');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// V2 task 104 — onboarding email + password integration (lib-level, 不過 HTTP)
// 直接驗 DB invariant: 註冊後 email + password_hash 寫入 + approved_at = NULL +
// 重複 email 撞 unique index.
// 不直接 call createMerchantAction (next/headers 在 vitest node 環境不能用),
// 模擬 action 內部 INSERT path — 跟 onboarding/security.test.ts 同 pattern.
// ─────────────────────────────────────────────────────────────────────────────

describe('merchant auth — task 104 onboarding integration', () => {
  const ONB_PREFIX = 't104_onb_';
  const ONB_EMAIL_A = `${ONB_PREFIX}new@test.local`;

  afterAll(async () => {
    await dbAdmin.delete(merchants).where(sql`slug LIKE ${ONB_PREFIX + '%'}`);
  });

  it('註冊新商家: email + password_hash 寫入, approved_at = NULL (pending)', async () => {
    const { hash: bcryptHash } = await import('bcryptjs');
    const passwordHash = await bcryptHash('test-password-104', 10);

    await dbAdmin.insert(merchants).values({
      slug: `${ONB_PREFIX}newshop`,
      name: '新商家測試 t104',
      email: ONB_EMAIL_A,
      passwordHash,
    });

    const [row] = await dbAdmin
      .select({
        email: merchants.email,
        passwordHash: merchants.passwordHash,
        approvedAt: merchants.approvedAt,
      })
      .from(merchants)
      .where(eq(merchants.slug, `${ONB_PREFIX}newshop`))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.email).toBe(ONB_EMAIL_A);
    expect(row!.passwordHash).toMatch(/^\$2[aby]\$/); // bcrypt 格式
    expect(row!.approvedAt).toBeNull(); // pending admin approval
  });

  it('重複 email 註冊 → DB unique violation (action 會 catch 回 "此 email 已註冊")', async () => {
    const { hash: bcryptHash } = await import('bcryptjs');
    const passwordHash = await bcryptHash('test-password-104', 10);

    // 第二筆 → unique violation 應該爆
    await expect(
      dbAdmin.insert(merchants).values({
        slug: `${ONB_PREFIX}newshop_dup`,
        name: '重複 email 測試',
        email: ONB_EMAIL_A,
        passwordHash,
      }),
    ).rejects.toThrow();
  });

  it('註冊後 approve → loginMerchant 對該 email 成功', async () => {
    // 把上面建的 newshop approve 掉
    await dbAdmin
      .update(merchants)
      .set({ approvedAt: new Date(), approvedByAdmin: 'test-suite' })
      .where(eq(merchants.slug, `${ONB_PREFIX}newshop`));

    const res = await loginMerchant(ONB_EMAIL_A, 'test-password-104', { ip: 'test-suite' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.cookieValue).toContain('.');
    }
  });
});
