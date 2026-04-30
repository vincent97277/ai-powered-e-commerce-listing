/**
 * V1.5 Track A2 — daily AI cost cap enforcement test suite
 *
 * 5 cases:
 *   1. tokenCost: GPT-4o pricing math 對 (per-1M token)
 *   2. getDailyCostCents: 加總當日 sessions 對
 *   3. assertWithinDailyCap: 沒超過 cap → 不 throw
 *   4. assertWithinDailyCap: 超過 cap → throw CapExceededError (含 code/usedCents/capCents)
 *   5. cross-tenant isolation: tenant A 用量不影響 tenant B 的 cap 判定
 *
 * 用 dbAdmin seed (admin observability 範圍, BYPASSRLS 是合法的, 跟 rls.e2e.test.ts 同 pattern)
 *
 * 用 cc... / dd... UUID 避開:
 *   - rls.e2e (99... / aa...)
 *   - demo merchants (11... / 22...)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { dbAdmin } from '@/db/admin-only';
import { merchants, importSessions, products, type ProductAiMetadata } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  tokenCost,
  getDailyCostCents,
  assertWithinDailyCap,
  CapExceededError,
} from '@/lib/observability/ai-cost';
import { getHealthIssues } from '@/lib/merchant/health-checks';

// V1.5 review C1: mock `ai` SDK 的 generateObject 給 vision usage plumbing test 用.
// 必須用 vi.mock (hoisted), factory 內讀外層變數會 hoist 失敗 → 在 mock factory 直接吐固定 usage.
// 真正測 callVisionWithRetry import 後跟 mocked generateObject 對接是否拿到 usage.
const MOCK_USAGE = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    // generateObject mock: 永遠回 valid productSchema + fixed usage
    generateObject: vi.fn().mockResolvedValue({
      object: {
        title: 'Mock 商品',
        description: 'Mock 描述用於測試 token usage 透傳',
        category: '其他',
        seo_tags: [],
        variants: [],
        price_twd: { min: 100, max: 200 },
        confidence: 0.9,
      },
      usage: MOCK_USAGE,
      finishReason: 'stop',
      warnings: [],
      response: { id: 'mock', timestamp: new Date(), modelId: 'mock' },
      logprobs: undefined,
      providerMetadata: undefined,
    }),
  };
});

const TENANT_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const TENANT_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ProductAiMetadata 是 jsonb NOT NULL — 給每個測試 row 一個 stub 滿足型別
const STUB_AI_META: ProductAiMetadata = {
  title: 'stub',
  description: 'stub',
  category: '其他',
  seo_tags: [],
  variants: [],
  price_twd: { min: 0, max: 0 },
  confidence: 0.5,
};

beforeAll(async () => {
  // 兩個 tenant: A 用 default cap (5000), B 用較低 cap (1000) 方便測 over-cap
  await dbAdmin
    .insert(merchants)
    .values([
      {
        id: TENANT_A,
        slug: 'cost-cap-a',
        name: 'Cost Cap Test A',
        dailyAiCostCentsCap: 5000,
      },
      {
        id: TENANT_B,
        slug: 'cost-cap-b',
        name: 'Cost Cap Test B',
        dailyAiCostCentsCap: 1000,
      },
    ])
    .onConflictDoNothing();

  // 確保 A/B 的 import_sessions table 是乾淨狀態 (前一輪 test 沒清乾淨也救一下)
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
});

afterAll(async () => {
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_A));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_B));
});

describe('tokenCost — pricing math (gpt-4o-2024-11-20)', () => {
  it('GPT-4o: 1M in + 1M out → 250 + 1000 = 1250 cents', () => {
    // $2.50 + $10 = $12.50 = 1250 cents
    expect(tokenCost(1_000_000, 1_000_000)).toBeCloseTo(1250, 5);
  });

  it('GPT-4o: 200k in + 100k out → 50 + 100 = 150 cents', () => {
    // (200000/1M)*2.5 + (100000/1M)*10 = 0.5 + 1.0 = $1.50 = 150 cents
    expect(tokenCost(200_000, 100_000)).toBeCloseTo(150, 4);
  });

  it('zero tokens → 0 cents', () => {
    expect(tokenCost(0, 0)).toBe(0);
  });
});

describe('getDailyCostCents — aggregator', () => {
  it('sums today sessions for one tenant', async () => {
    // Seed 3 sessions for tenant A (all OpenAI pricing now):
    //  - 1M in + 1M out = 1250 cents
    //  - 500k in + 500k out = 625 cents
    //  - 200k in + 100k out = 150 cents
    // total = 2025 cents
    await dbAdmin.insert(importSessions).values([
      {
        merchantId: TENANT_A,
        sourceUrl: 'https://test/a-1',
        sourceType: 'ig',
        tokensIn: 1_000_000,
        tokensOut: 1_000_000,
      },
      {
        merchantId: TENANT_A,
        sourceUrl: 'https://test/a-2',
        sourceType: 'shopee',
        tokensIn: 500_000,
        tokensOut: 500_000,
      },
      {
        merchantId: TENANT_A,
        sourceUrl: 'https://test/a-3',
        sourceType: 'ig',
        tokensIn: 200_000,
        tokensOut: 100_000,
      },
    ]);

    const cost = await getDailyCostCents(TENANT_A);
    // 1250 + 625 + 150 = 2025 cents
    expect(cost).toBe(2025);

    // cleanup for next test
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  });

  it('returns 0 when tenant has no sessions today', async () => {
    const cost = await getDailyCostCents(TENANT_A);
    expect(cost).toBe(0);
  });
});

describe('assertWithinDailyCap', () => {
  it('does not throw when usage is under cap', async () => {
    // Tenant A cap = 5000 cents. Seed small usage (well under)
    // (50k/1M)*2.5 + (10k/1M)*10 = 0.125 + 0.1 = $0.225 = 22.5 cents → 23 (rounded)
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/under-cap',
      sourceType: 'ig',
      tokensIn: 50_000,
      tokensOut: 10_000,
    });

    await expect(assertWithinDailyCap(TENANT_A)).resolves.toBeUndefined();

    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  });

  it('throws CapExceededError with code+usedCents+capCents when over cap', async () => {
    // Tenant B cap = 1000 cents. Seed enough OpenAI tokens to bust:
    //  500k in + 500k out OpenAI = (0.5 * 2.5) + (0.5 * 10) = $1.25 + $5 = $6.25 = 625 cents
    // Add another 500k in + 500k out → 1250 cents total > 1000 cap
    await dbAdmin.insert(importSessions).values([
      {
        merchantId: TENANT_B,
        sourceUrl: 'https://test/b-1',
        sourceType: 'ig',
        tokensIn: 500_000,
        tokensOut: 500_000,
      },
      {
        merchantId: TENANT_B,
        sourceUrl: 'https://test/b-2',
        sourceType: 'ig',
        tokensIn: 500_000,
        tokensOut: 500_000,
      },
    ]);

    let caught: CapExceededError | null = null;
    try {
      await assertWithinDailyCap(TENANT_B);
    } catch (err) {
      caught = err as CapExceededError;
    }

    expect(caught).not.toBeNull();
    expect(caught).toBeInstanceOf(CapExceededError);
    expect(caught!.code).toBe('AI_COST_CAP_EXCEEDED');
    expect(caught!.capCents).toBe(1000);
    expect(caught!.usedCents).toBeGreaterThanOrEqual(1000);
    expect(caught!.message).toContain('NT$');
    expect(caught!.message).toContain('已達上限');

    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  });

  // V1.5 review C1: vision plumbs SDK usage back to caller (the WRITE-path proof).
  // 不測 import_sessions.tokens_in/out 的 atomic increment SQL — 那要更大 setup,
  // 此處重點是證明 vision.ts 沒丟 result.usage. ingest worker 拿到後寫進 DB 是 trivial 的下一步.
  it('callVisionWithRetry returns usage extracted from generateObject result', async () => {
    // 動態 import 確保 vi.mock('ai') 已 wired
    const { callVisionWithRetry } = await import('@/lib/ai/vision');

    // 給一個不會被打的「buffer」(generateObject 已 mock, 不會真讀 image)
    const fakeBuffer = Buffer.from('fake-image-bytes-not-actually-decoded');
    const r = await callVisionWithRetry({
      imageBuffer: fakeBuffer,
      brandVoice: '中性語氣',
      maxRetries: 0,
    });

    expect(r.success).toBe(true);
    if (!r.success) return; // type narrow
    expect(r.usage).toBeDefined();
    expect(r.usage.tokensIn).toBe(MOCK_USAGE.promptTokens);
    expect(r.usage.tokensOut).toBe(MOCK_USAGE.completionTokens);
  });

  it('cross-tenant isolation: tenant A spending does NOT count toward tenant B cap', async () => {
    // Tenant A 把自己 cap 燒爆 (5000 cents 全用完)
    // 但 Tenant B 的 cap 判定不應該被 A 的用量污染
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/a-burn',
      sourceType: 'ig',
      tokensIn: 10_000_000, // 10M tokens, OpenAI = (10*2.5)+(...)
      tokensOut: 5_000_000,
    });

    // 確認 A 真的爆了
    const aCost = await getDailyCostCents(TENANT_A);
    expect(aCost).toBeGreaterThan(5000); // > A 的 cap

    // B 沒任何 session → 應該 well under B 的 1000 cap, 不 throw
    await expect(assertWithinDailyCap(TENANT_B)).resolves.toBeUndefined();

    // 反向: B 自己有少量用量 → 也不該 throw
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_B,
      sourceUrl: 'https://test/b-light',
      sourceType: 'ig',
      tokensIn: 50_000,
      tokensOut: 10_000,
    });
    await expect(assertWithinDailyCap(TENANT_B)).resolves.toBeUndefined();

    // cleanup
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  });
});

// V1.5 review M4: fixture demo 圖也算 no_photo (跟列表頁 hasImg 條件對齊)
describe('getHealthIssues — no_photo includes fixture path', () => {
  it('counts product with r2_key like %/fixtures/% as no_photo', async () => {
    // tenant A 已在 outer beforeAll 建好. 先清乾淨 products, 再塞 3 件測試料:
    //   - 1 件 r2_key = '' → no_photo (schema 是 NOT NULL, 用空字串代表「沒上傳」)
    //   - 1 件 r2_key = 'test/fixtures/foo.jpg' → no_photo (新增的 case, M4 的核心)
    //   - 1 件 r2_key = '<tenantId>/abc.webp' → real upload, 不算
    // 預期: noPhoto count = 2
    await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_A));
    await dbAdmin.insert(products).values([
      {
        tenantId: TENANT_A,
        title: '商品標題長度足夠避開 short_title',
        description: '描述',
        priceCents: 10000,
        stockQuantity: 5,
        r2Key: '',
        aiMetadata: STUB_AI_META,
      },
      {
        tenantId: TENANT_A,
        title: '商品標題長度足夠避開 short_title',
        description: '描述',
        priceCents: 10000,
        stockQuantity: 5,
        r2Key: 'test/fixtures/foo.jpg',
        aiMetadata: STUB_AI_META,
      },
      {
        tenantId: TENANT_A,
        title: '商品標題長度足夠避開 short_title',
        description: '描述',
        priceCents: 10000,
        stockQuantity: 5,
        r2Key: 'cccccccc-cccc-cccc-cccc-cccccccccccc/abc.webp',
        aiMetadata: STUB_AI_META,
      },
    ]);

    const issues = await getHealthIssues(TENANT_A);
    const noPhoto = issues.find((i) => i.type === 'no_photo');
    expect(noPhoto).toBeDefined();
    expect(noPhoto!.count).toBe(2);

    // cleanup
    await dbAdmin.delete(products).where(eq(products.tenantId, TENANT_A));
  });
});
