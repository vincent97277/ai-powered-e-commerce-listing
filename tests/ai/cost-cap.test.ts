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
import {
  merchants,
  importSessions,
  aiUsageEvents,
  products,
  type ProductAiMetadata,
} from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  tokenCost,
  getDailyCostCents,
  assertWithinDailyCap,
  CapExceededError,
} from '@/lib/observability/ai-cost';
import {
  getPlatformCostToday,
  getCostTimeseries14d,
  flagAnomaly,
} from '@/lib/observability/ai-cost-platform';
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

  // 確保 A/B 的 import_sessions / ai_usage_events 是乾淨狀態 (前一輪 test 沒清乾淨也救一下)
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_B));
});

afterAll(async () => {
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
  await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_B));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_A));
  await dbAdmin.delete(merchants).where(eq(merchants.id, TENANT_B));
});

describe('tokenCost — pricing math (gpt-4o-2024-11-20, NT$ cents @ USD_TO_TWD=30)', () => {
  it('GPT-4o: 1M in + 1M out → $12.50 USD × 30 = 37500 NT cents', () => {
    // $2.50 + $10 = $12.50 USD × 30 TWD/USD × 100 cents/TWD = 37500 NT cents
    expect(tokenCost(1_000_000, 1_000_000)).toBeCloseTo(37500, 4);
  });

  it('GPT-4o: 200k in + 100k out → $1.50 USD × 30 = 4500 NT cents', () => {
    // (200000/1M)*2.5 + (100000/1M)*10 = $1.50 USD × 30 × 100 = 4500 NT cents
    expect(tokenCost(200_000, 100_000)).toBeCloseTo(4500, 4);
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
    // (1250 + 625 + 150) USD cents × 30 TWD/USD = 60750 NT cents
    expect(cost).toBe(60750);

    // cleanup for next test
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  });

  it('returns 0 when tenant has no sessions today', async () => {
    const cost = await getDailyCostCents(TENANT_A);
    expect(cost).toBe(0);
  });

  // V1.5 smoke fix: sync photo upload 走 ai_usage_events, 不走 import_sessions
  it('includes ai_usage_events rows (sync photo upload path)', async () => {
    // 200k in + 100k out via ai_usage_events = 150 USD cents × 30 = 4500 NT cents
    await dbAdmin.insert(aiUsageEvents).values({
      tenantId: TENANT_A,
      tokensIn: 200_000,
      tokensOut: 100_000,
      source: 'photo_upload',
    });

    const cost = await getDailyCostCents(TENANT_A);
    expect(cost).toBe(4500);

    await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
  });

  // V1.5 smoke fix: 同一商家同日 import_sessions + ai_usage_events 兩源加總
  it('aggregates across import_sessions AND ai_usage_events', async () => {
    // import_sessions: 1M in + 1M out = 1250 USD cents × 30 = 37500 NT cents
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/agg-1',
      sourceType: 'ig',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    // ai_usage_events: 200k in + 100k out = 150 USD cents × 30 = 4500 NT cents
    await dbAdmin.insert(aiUsageEvents).values({
      tenantId: TENANT_A,
      tokensIn: 200_000,
      tokensOut: 100_000,
      source: 'photo_upload',
    });

    const cost = await getDailyCostCents(TENANT_A);
    expect(cost).toBe(37500 + 4500);

    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
    await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
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
    // Tenant A 把自己 cap 燒爆 — 一半走 import_sessions, 一半走 ai_usage_events
    // (混用兩源是為了測 V1.5 smoke fix 的雙表加總也守 tenant 邊界)
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/a-burn',
      sourceType: 'ig',
      tokensIn: 5_000_000,
      tokensOut: 2_500_000,
    });
    await dbAdmin.insert(aiUsageEvents).values({
      tenantId: TENANT_A,
      tokensIn: 5_000_000,
      tokensOut: 2_500_000,
      source: 'photo_upload',
    });

    // 確認 A 真的爆了
    const aCost = await getDailyCostCents(TENANT_A);
    expect(aCost).toBeGreaterThan(5000); // > A 的 cap

    // B 沒任何 session → 應該 well under B 的 1000 cap, 不 throw
    await expect(assertWithinDailyCap(TENANT_B)).resolves.toBeUndefined();

    // 反向: B 自己有少量用量 (混用兩源) → 也不該 throw
    // B cap = 1000 NT cents, 用 5k+1k tokens 兩筆 ≈ 63 NT cents 兩源加總 → 遠低於 cap
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_B,
      sourceUrl: 'https://test/b-light',
      sourceType: 'ig',
      tokensIn: 5_000,
      tokensOut: 1_000,
    });
    await dbAdmin.insert(aiUsageEvents).values({
      tenantId: TENANT_B,
      tokensIn: 5_000,
      tokensOut: 1_000,
      source: 'photo_upload',
    });
    await expect(assertWithinDailyCap(TENANT_B)).resolves.toBeUndefined();

    // cleanup
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_B));
    await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_A));
    await dbAdmin.delete(aiUsageEvents).where(eq(aiUsageEvents.tenantId, TENANT_B));
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

/* ─────────────────────────── V1.6 A9: platform-wide cost aggregation ─────────────────────────── */

/**
 * 跟 per-tenant getDailyCostCents 不一樣的地方:
 *   - 跨 tenant 加總 (含 top-N breakdown)
 *   - 14 天 timeseries (TPE local date GROUP BY)
 *   - 2× anomaly flag
 *
 * 共用 TENANT_A / TENANT_B 但每個 test 自己 cleanup, 免污染後續 test.
 */
describe('V1.6 A9 — platform-wide cost aggregation', () => {
  // 每個 test 跑完都把 import_sessions / ai_usage_events 全清乾淨。
  //
  // 為什麼是「全清」不是「清 A/B」: getPlatformCostToday / getCostTimeseries14d /
  // flagAnomaly 是 platform-wide 聚合 — 沒有 tenant filter (這就是 platform-wide
  // 的意思)。任何來自其他 test (e.g. tests/rls.e2e.test.ts T9 用 99999999-... /
  // aaaaaaaa-... 兩個 tenant 跑 ai_usage_events 寫入測試) 或手動操作 (operator 跑
  // local upload) 留下的 row 都會混入聚合結果。
  //
  // V2.6.2 retro 發現: T9 seed 後 afterAll 若曾因 crash 沒跑完, 留下 100+50 tokens
  // 的 row 永遠掛在 local docker postgres, 之後每次跑 cost-cap 都會 +23 cents 對不上
  // 預期值。CI 用 ephemeral postgres 不受影響, 但 local dev 會。
  //
  // 風險: 若另一個測試檔正在 parallel 執行寫入這兩張表, 此 wipe 會踩到它。
  // 但 vitest 預設 fork pool + 不同檔不共用 fixtures → 在實務上 platform-agg
  // describe 跑時其他檔不會同步寫這兩張表。
  async function cleanupCostRows() {
    await dbAdmin.delete(importSessions);
    await dbAdmin.delete(aiUsageEvents);
  }

  it('getPlatformCostToday — sums across multiple tenants AND both source tables', async () => {
    await cleanupCostRows();

    // tenant A: import_sessions 1M+1M = 37500 NT cents + ai_usage_events 200k+100k = 4500
    //                                                         → A 總額 42000 cents
    // tenant B: ai_usage_events 500k+500k = (1.25+5)$=6.25 USD ×30×100 = 18750 NT cents
    //                                                         → B 總額 18750 cents
    // platform total = 60750 cents
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/platform-a',
      sourceType: 'ig',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    await dbAdmin.insert(aiUsageEvents).values([
      {
        tenantId: TENANT_A,
        tokensIn: 200_000,
        tokensOut: 100_000,
        source: 'photo_upload',
      },
      {
        tenantId: TENANT_B,
        tokensIn: 500_000,
        tokensOut: 500_000,
        source: 'photo_upload',
      },
    ]);

    const res = await getPlatformCostToday(10);
    expect(res.totalCents).toBe(42000 + 18750);
    expect(res.perTenantTopN).toHaveLength(2);
    // A 比 B 多 → 排第一
    expect(res.perTenantTopN[0]!.tenantId).toBe(TENANT_A);
    expect(res.perTenantTopN[0]!.cents).toBe(42000);
    expect(res.perTenantTopN[0]!.slug).toBe('cost-cap-a');
    expect(res.perTenantTopN[1]!.tenantId).toBe(TENANT_B);
    expect(res.perTenantTopN[1]!.cents).toBe(18750);

    await cleanupCostRows();
  });

  it('getCostTimeseries14d — returns 14 points with today aggregated correctly', async () => {
    await cleanupCostRows();

    // 今日 (TPE) 塞 1M+1M = 37500 cents 走 import_sessions
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/timeseries',
      sourceType: 'ig',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });

    const series = await getCostTimeseries14d();
    expect(series).toHaveLength(14);

    // 最後一個 point 是今天 (順序: 13 天前 → 今天遞增)
    // 拿 TPE local date 比對 — 用跟 implementation 同樣的算法
    const now = new Date();
    const tpeNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayLabel = `${tpeNow.getUTCFullYear()}-${String(tpeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(tpeNow.getUTCDate()).padStart(2, '0')}`;

    expect(series[13]!.date).toBe(todayLabel);
    expect(series[13]!.cents).toBe(37500);

    // date 嚴格遞增 (lexicographic on YYYY-MM-DD = chronological)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.date > series[i - 1]!.date).toBe(true);
    }

    await cleanupCostRows();
  });

  it('flagAnomaly — returns isAnomaly:true when today > 2× prev_7d_avg', async () => {
    await cleanupCostRows();

    // 建 baseline: 過去 7 天 (不含今天) 每天 1M+1M tokens = 37500 cents/day
    // → prev_7d_avg = 37500 cents, 2× threshold = 75000 cents
    // 用 created_at 顯式倒回 1~7 天前 (TPE) 避開「今天」邊界
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const baselineRows = Array.from({ length: 7 }, (_, i) => ({
      merchantId: TENANT_A,
      sourceUrl: `https://test/anomaly-baseline-${i}`,
      sourceType: 'ig' as const,
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
      // i+1 天前的 此刻 — 確保 < 今日 TPE 00:00 邊界 (除非「現在」剛好 00:00, 罕見邊界這 test 接受)
      createdAt: new Date(now - (i + 1) * dayMs),
    }));
    await dbAdmin.insert(importSessions).values(baselineRows);

    // 今天塞 4M+4M tokens = 4 × 37500 = 150000 cents > 2 × 37500 = 75000 → 異常
    await dbAdmin.insert(aiUsageEvents).values({
      tenantId: TENANT_A,
      tokensIn: 4_000_000,
      tokensOut: 4_000_000,
      source: 'photo_upload',
    });

    const res = await flagAnomaly();
    expect(res.isAnomaly).toBe(true);
    expect(res.reason).toBe('今日 > 2× 過去 7 天平均');
    expect(res.prev7dAvgCents).toBe(37500);
    expect(res.todayCents).toBe(150000);
    expect(res.todayCents).toBeGreaterThan(2 * res.prev7dAvgCents);

    // bonus: 確認 prev_7d_avg=0 → isAnomaly:false (基準不足 short-circuit)
    await cleanupCostRows();
    const empty = await flagAnomaly();
    expect(empty.isAnomaly).toBe(false);
    expect(empty.reason).toBe('基準資料不足');

    await cleanupCostRows();
  });
});
