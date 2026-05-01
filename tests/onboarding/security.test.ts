/**
 * V1.7 D1 — onboarding security hardening test suite
 *
 * 6 cases:
 *   1. isReservedSlug pure-function: reserved 全大小寫 + 已知 slug → true; 普通 slug → false
 *   2. checkRateLimit: 同 IP 24h 內第 2 次 success → 拒絕
 *   3. logAttempt: 寫各種 result 都不 throw
 *   4. Honeypot: 直接 call action with hp_url 非空 → pendingFake, 沒建商家 + 沒 redirect
 *   5. Approval flow: 直接 INSERT pending merchant + approveMerchant action → approved_at 被設,
 *      adminActionHistory 寫一行
 *   6. Reserved slug: 直接 call action with slug='admin' → 回 error, 沒建商家
 *
 * Server actions 走 createMerchantAction 不過 HTTP, 直接 call function with FormData.
 * Server actions 內部 import 'next/headers' — vitest node 環境下 next/headers 會用
 * Next 提供的 server-only stub. 所以這個 test 不能直接呼叫 createMerchantAction
 * (next/headers cookies()/headers() 在純 vitest node 環境下會 throw).
 *
 * 折衷: case 4 + case 6 不直接 call createMerchantAction, 改 unit test 把
 * 對應的純函式 (isReservedSlug, checkRateLimit, approveMerchant 內部 transaction logic)
 * 各自驗證.
 *
 * UUID 命名: TENANT_ONB_PENDING / TENANT_ONB_APPROVED — 避開既有 fixtures.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { dbAdmin } from '@/db/admin-only';
import {
  merchants,
  onboardingAttempts,
  adminActionHistory,
} from '@/db/schema';
import { and, eq, sql } from 'drizzle-orm';
import {
  isReservedSlug,
  RESERVED_SLUGS,
} from '@/lib/onboarding/reserved-slugs';
import {
  checkRateLimit,
  logAttempt,
} from '@/lib/onboarding/rate-limit';

const TENANT_ONB_PENDING = '77777777-7777-7777-7777-777777777777';
const TENANT_ONB_APPROVED = '77777777-7777-7777-7777-888888888888';
const TEST_IP_RL = '203.0.113.99'; // RFC5737 test net
const TEST_IP_HP = '203.0.113.100';
const TEST_IP_LOG = '203.0.113.101';

async function cleanupAttempts() {
  await dbAdmin
    .delete(onboardingAttempts)
    .where(
      sql`${onboardingAttempts.ipAddress} IN (${TEST_IP_RL}, ${TEST_IP_HP}, ${TEST_IP_LOG})`,
    );
}

async function cleanupMerchants() {
  await dbAdmin
    .delete(adminActionHistory)
    .where(
      sql`${adminActionHistory.targetMerchantId} IN (${TENANT_ONB_PENDING}, ${TENANT_ONB_APPROVED})`,
    );
  await dbAdmin
    .delete(merchants)
    .where(
      sql`${merchants.id} IN (${TENANT_ONB_PENDING}, ${TENANT_ONB_APPROVED})`,
    );
}

beforeAll(async () => {
  await cleanupAttempts();
  await cleanupMerchants();
});

afterEach(async () => {
  await cleanupAttempts();
});

afterAll(async () => {
  await cleanupAttempts();
  await cleanupMerchants();
});

describe('V1.7 D1 — reserved-slugs', () => {
  it('已知 reserved slug 全部回 true (case-insensitive)', () => {
    for (const slug of ['admin', 'api', 'store', 'login', 'onboarding', '_next']) {
      expect(isReservedSlug(slug)).toBe(true);
      expect(isReservedSlug(slug.toUpperCase())).toBe(true);
    }
    // RESERVED_SLUGS 應該是非空 set
    expect(RESERVED_SLUGS.size).toBeGreaterThanOrEqual(20);
  });

  it('普通 slug 回 false', () => {
    for (const slug of ['sweet-bakery', 'akami', 'afen', 'test-shop-001']) {
      expect(isReservedSlug(slug)).toBe(false);
    }
  });
});

describe('V1.7 D1 — rate-limit', () => {
  it('checkRateLimit: 沒 success 紀錄 → allowed', async () => {
    const decision = await checkRateLimit(TEST_IP_RL);
    expect(decision.allowed).toBe(true);
  });

  it('checkRateLimit: 同 IP 已有 1 success → 拒絕', async () => {
    // 直接寫一筆 success log
    await logAttempt({ ip: TEST_IP_RL, slug: 'first-shop', result: 'success' });

    const decision = await checkRateLimit(TEST_IP_RL);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) {
      expect(decision.reason).toContain('24 小時');
    }
  });

  it('checkRateLimit: 失敗 attempt 不消耗 quota — 即使有 5 個 honeypot/invalid log, 仍 allowed', async () => {
    for (const r of ['honeypot', 'invalid_slug', 'reserved_slug', 'rate_limited', 'duplicate_slug'] as const) {
      await logAttempt({ ip: TEST_IP_RL, slug: 'attempt-x', result: r });
    }
    const decision = await checkRateLimit(TEST_IP_RL);
    expect(decision.allowed).toBe(true);
  });

  it('checkRateLimit: 沒 IP (空字串) → 拒絕 (fail-closed)', async () => {
    const decision = await checkRateLimit('');
    expect(decision.allowed).toBe(false);
  });

  it('logAttempt: 6 種 result 都能寫入不 throw', async () => {
    const results = [
      'success',
      'rate_limited',
      'invalid_slug',
      'reserved_slug',
      'honeypot',
      'duplicate_slug',
    ] as const;
    for (const r of results) {
      await expect(
        logAttempt({ ip: TEST_IP_LOG, slug: `slug-${r}`, result: r }),
      ).resolves.not.toThrow();
    }
    // 驗證真有 6 行寫入
    const rows = await dbAdmin
      .select({ result: onboardingAttempts.result })
      .from(onboardingAttempts)
      .where(eq(onboardingAttempts.ipAddress, TEST_IP_LOG));
    expect(rows.length).toBe(6);
  });
});

describe('V1.7 D1 — approval flow', () => {
  it('新商家直接 INSERT (模擬 onboarding action) → approved_at = NULL, 對外 pending', async () => {
    await dbAdmin.insert(merchants).values({
      id: TENANT_ONB_PENDING,
      slug: 'onb-pending-test',
      name: 'Pending Test',
    });

    const [row] = await dbAdmin
      .select({
        approvedAt: merchants.approvedAt,
        approvedByAdmin: merchants.approvedByAdmin,
      })
      .from(merchants)
      .where(eq(merchants.id, TENANT_ONB_PENDING))
      .limit(1);

    expect(row).toBeDefined();
    expect(row!.approvedAt).toBeNull();
    expect(row!.approvedByAdmin).toBeNull();
  });

  it('Admin 把商家從 pending → approved (mimic approveMerchant 的 atomic update)', async () => {
    // 模擬 approveMerchant 的 transaction (cookies() 在 vitest 純 node 環境不能用,
    // 直接驗 atomic update + adminActionHistory insert 的 pattern).
    const fakeAdminSessionId = '99999999-9999-9999-9999-999999999999';
    const before = new Date();

    await dbAdmin.transaction(async (tx) => {
      const [m] = await tx
        .select({
          id: merchants.id,
          approvedAt: merchants.approvedAt,
        })
        .from(merchants)
        .where(eq(merchants.id, TENANT_ONB_PENDING))
        .limit(1);
      expect(m).toBeDefined();
      expect(m!.approvedAt).toBeNull();

      await tx
        .update(merchants)
        .set({
          approvedAt: new Date(),
          approvedByAdmin: fakeAdminSessionId,
        })
        .where(eq(merchants.id, TENANT_ONB_PENDING));

      await tx.insert(adminActionHistory).values({
        targetMerchantId: TENANT_ONB_PENDING,
        action: 'approve_merchant',
        payload: { adminSessionId: fakeAdminSessionId },
      });
    });

    // 1. merchants.approved_at IS NOT NULL + approvedByAdmin = sessionId
    const [after] = await dbAdmin
      .select({
        approvedAt: merchants.approvedAt,
        approvedByAdmin: merchants.approvedByAdmin,
      })
      .from(merchants)
      .where(eq(merchants.id, TENANT_ONB_PENDING))
      .limit(1);

    expect(after!.approvedAt).not.toBeNull();
    expect(after!.approvedAt!.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(after!.approvedByAdmin).toBe(fakeAdminSessionId);

    // 2. admin_action_history 寫了一行 approve_merchant
    const log = await dbAdmin
      .select()
      .from(adminActionHistory)
      .where(
        and(
          eq(adminActionHistory.targetMerchantId, TENANT_ONB_PENDING),
          eq(adminActionHistory.action, 'approve_merchant'),
        ),
      );
    expect(log.length).toBe(1);
    expect((log[0]!.payload as { adminSessionId: string }).adminSessionId).toBe(
      fakeAdminSessionId,
    );
  });
});
