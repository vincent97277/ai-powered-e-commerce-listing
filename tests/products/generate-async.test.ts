/**
 * /api/products/generate (V2.2.5 async) + /api/products/generate/status — HTTP integration tests.
 *
 * Verifies the post-refactor flow:
 *  1. POST /api/products/generate validates merchant + cap + storage-key shape, then
 *     returns { status: 'pending' } without doing the vision call.
 *  2. GET /api/products/generate/status?storageKey=... reads the products row written
 *     by the Inngest worker, keyed on aiMetadata.source_key, and returns success/pending/failed.
 *  3. Tenant scope is enforced — querying with a key that belongs to another merchant 403s.
 *
 * Skipped if dev server is down (CI provisions postgres but dev server is local-only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products, adminSessions, type ProductAiMetadata } from '@/db/schema';
import { eq, inArray } from 'drizzle-orm';
import { ADMIN_SESSION_COOKIE, createAdminSession } from '@/lib/admin-session';
import { MERCHANT_SESSION_COOKIE, loginMerchant } from '@/lib/merchant-session';
import bcrypt from 'bcryptjs';

const BASE = 'http://localhost:3000';

// Use unique 5xxx... prefix so we don't collide with rls / cost-cap / admin-search seeds.
const T_GEN = '55555555-cccc-cccc-cccc-cccccccccc11';
const T_OTHER = '55555555-cccc-cccc-cccc-cccccccccc22';

let merchantCookie: string | null = null;
let otherMerchantCookie: string | null = null;
let adminCookie: string | null = null;
let serverUp = false;

beforeAll(async () => {
  try {
    const r = await fetch(`${BASE}/`);
    serverUp = r.ok || r.status < 500;
  } catch {
    serverUp = false;
  }
  if (!serverUp) {
    console.warn('skip generate-async tests: dev server not running');
    return;
  }

  const passwordHash = await bcrypt.hash('test-pw-1234', 10);
  await dbAdmin
    .insert(merchants)
    .values([
      {
        id: T_GEN,
        slug: 'generate-async-test',
        name: 'Generate Async Test',
        email: 'gen-async@demo.local',
        passwordHash,
        approvedAt: new Date(),
      },
      {
        id: T_OTHER,
        slug: 'generate-async-other',
        name: 'Generate Async Other',
        email: 'gen-async-other@demo.local',
        passwordHash,
        approvedAt: new Date(),
      },
    ])
    .onConflictDoNothing();

  const login1 = await loginMerchant('gen-async@demo.local', 'test-pw-1234', {
    ip: 'gen-async-test',
    userAgent: 'vitest',
  });
  if (!login1.success) throw new Error('merchant login failed: ' + login1.error);
  merchantCookie = `${MERCHANT_SESSION_COOKIE}=${login1.cookieValue}`;

  const login2 = await loginMerchant('gen-async-other@demo.local', 'test-pw-1234', {
    ip: 'gen-async-test-other',
    userAgent: 'vitest',
  });
  if (!login2.success) throw new Error('other merchant login failed: ' + login2.error);
  otherMerchantCookie = `${MERCHANT_SESSION_COOKIE}=${login2.cookieValue}`;

  const admin = await createAdminSession({ ip: 'gen-async-admin' });
  adminCookie = `${ADMIN_SESSION_COOKIE}=${admin.cookieValue}`;
});

afterAll(async () => {
  await dbAdmin.delete(products).where(inArray(products.tenantId, [T_GEN, T_OTHER]));
  await dbAdmin.delete(merchants).where(inArray(merchants.id, [T_GEN, T_OTHER]));
  // Best-effort session cleanup
  try {
    await dbAdmin.delete(adminSessions).where(eq(adminSessions.ip, 'gen-async-admin'));
  } catch {
    // ignore
  }
});

async function postGenerate(storageKey: string, cookie: string | null) {
  if (!cookie) return null;
  return await fetch(`${BASE}/api/products/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({ storageKey }),
  });
}

async function getStatus(storageKey: string, cookie: string | null) {
  if (!cookie) return null;
  return await fetch(
    `${BASE}/api/products/generate/status?storageKey=${encodeURIComponent(storageKey)}`,
    { headers: { cookie } },
  );
}

describe('POST /api/products/generate (async enqueue)', () => {
  it('rejects request without storageKey', async () => {
    if (!serverUp) return;
    const r = await postGenerate('', merchantCookie);
    if (!r) return;
    expect(r.status).toBe(400);
    const j = await r.json();
    expect(j.error).toMatch(/storageKey/);
  });

  it('rejects storage key that does not belong to current merchant', async () => {
    if (!serverUp) return;
    const r = await postGenerate(`${T_OTHER}/abc.jpg`, merchantCookie);
    if (!r) return;
    expect(r.status).toBe(403);
  });

  it('returns status=pending when storage key is valid AND Inngest is reachable', async () => {
    if (!serverUp) return;
    const r = await postGenerate(`${T_GEN}/test-pending-${Date.now()}.jpg`, merchantCookie);
    if (!r) return;
    // The dev CLI may not be running in test env. Both outcomes are valid:
    //  - 200 → CLI present, event sent
    //  - 503 → CLI absent, route correctly surfaces INNGEST_UNAVAILABLE
    expect([200, 503]).toContain(r.status);
    const j = await r.json();
    if (r.status === 200) {
      expect(j.success).toBe(true);
      expect(j.status).toBe('pending');
      expect(j.merchantSlug).toBe('generate-async-test');
    } else {
      expect(j.error).toBe('INNGEST_UNAVAILABLE');
    }
  });

  it('rejects unauthenticated requests with redirect to /merchant/login', async () => {
    if (!serverUp) return;
    const r = await fetch(`${BASE}/api/products/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storageKey: `${T_GEN}/abc.jpg` }),
      redirect: 'manual',
    });
    expect([307, 308]).toContain(r.status);
    expect(r.headers.get('location')).toMatch(/\/merchant\/login/);
  });
});

describe('GET /api/products/generate/status (poll)', () => {
  it('returns pending when no products row exists for that source_key', async () => {
    if (!serverUp) return;
    const key = `${T_GEN}/status-pending-${Date.now()}.jpg`;
    const r = await getStatus(key, merchantCookie);
    if (!r) return;
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.status).toBe('pending');
  });

  it('returns success + ProductOutput when worker has written the row', async () => {
    if (!serverUp) return;
    const key = `${T_GEN}/status-success-${Date.now()}.jpg`;
    const meta: ProductAiMetadata = {
      title: 'Test Tea Cup',
      description: 'Lovely test cup for vitest',
      category: '居家生活',
      seo_tags: ['茶杯', '陶瓷'],
      variants: [{ name: '顏色', options: ['白', '黑'] }],
      price_twd: { min: 200, max: 400 },
      confidence: 0.9,
      status: 'success',
      source_key: key,
    };
    await dbAdmin.insert(products).values({
      tenantId: T_GEN,
      title: meta.title,
      description: meta.description,
      r2Key: `${T_GEN}/processed/abc.webp`,
      priceCents: 20000,
      aiMetadata: meta,
    });

    const r = await getStatus(key, merchantCookie);
    if (!r) return;
    expect(r.status).toBe(200);
    const j = await r.json();
    expect(j.status).toBe('success');
    expect(j.productId).toMatch(/^[0-9a-f-]{36}$/);
    expect(j.data.title).toBe('Test Tea Cup');
    expect(j.data.variants).toEqual(['顏色 白', '顏色 黑']);
  });

  it('returns failed + error message when worker recorded failure', async () => {
    if (!serverUp) return;
    const key = `${T_GEN}/status-failed-${Date.now()}.jpg`;
    const meta: ProductAiMetadata = {
      title: '上架失敗',
      description: '需手動補資料',
      category: '其他',
      seo_tags: [],
      variants: [],
      price_twd: { min: 0, max: 0 },
      confidence: 0,
      status: 'failed',
      source_key: key,
      error: 'OPENAI_TIMEOUT',
    };
    await dbAdmin.insert(products).values({
      tenantId: T_GEN,
      title: meta.title,
      description: meta.description,
      r2Key: `${T_GEN}/processed/failed.webp`,
      priceCents: 0,
      productStatus: 'needs_review',
      aiMetadata: meta,
    });

    const r = await getStatus(key, merchantCookie);
    if (!r) return;
    const j = await r.json();
    expect(j.status).toBe('failed');
    expect(j.error).toBe('OPENAI_TIMEOUT');
  });

  it('rejects cross-tenant lookup (storage key belongs to other merchant)', async () => {
    if (!serverUp) return;
    const key = `${T_OTHER}/leaky-key.jpg`;
    const r = await getStatus(key, merchantCookie);
    if (!r) return;
    expect(r.status).toBe(403);
  });

  it('cannot see other merchant rows even if storage key prefix matches own', async () => {
    if (!serverUp) return;
    // Other merchant has a row written for THEIR key. Asking for it as merchant T_GEN
    // is a 403 (prefix check). Asking for it as T_OTHER gets the row.
    const otherKey = `${T_OTHER}/cross-tenant-${Date.now()}.jpg`;
    const meta: ProductAiMetadata = {
      title: 'Other tenant secret',
      description: 'should not leak',
      category: '其他',
      seo_tags: [],
      variants: [],
      price_twd: { min: 100, max: 200 },
      confidence: 0.5,
      status: 'success',
      source_key: otherKey,
    };
    await dbAdmin.insert(products).values({
      tenantId: T_OTHER,
      title: meta.title,
      description: meta.description,
      r2Key: `${T_OTHER}/processed/x.webp`,
      priceCents: 10000,
      aiMetadata: meta,
    });

    // T_GEN tries → 403 (prefix mismatch)
    const r1 = await getStatus(otherKey, merchantCookie);
    if (!r1) return;
    expect(r1.status).toBe(403);

    // T_OTHER tries → success
    const r2 = await getStatus(otherKey, otherMerchantCookie);
    if (!r2) return;
    expect(r2.status).toBe(200);
    const j = await r2.json();
    expect(j.status).toBe('success');
    expect(j.data.title).toBe('Other tenant secret');
  });
});
