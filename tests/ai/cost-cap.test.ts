/**
 * V1.5 Track A2 — daily AI cost cap enforcement test suite
 *
 * 5 cases:
 *   1. tokenCost: GPT-4o pricing math correct (per-1M token)
 *   2. getDailyCostCents: sums today's sessions correctly
 *   3. assertWithinDailyCap: under cap → no throw
 *   4. assertWithinDailyCap: over cap → throws CapExceededError (with code/usedCents/capCents)
 *   5. cross-tenant isolation: tenant A usage does not affect tenant B's cap decision
 *
 * Uses dbAdmin to seed (admin observability scope, BYPASSRLS is legitimate, same pattern as rls.e2e.test.ts)
 *
 * Uses cc... / dd... UUIDs to avoid:
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

// V1.5 review C1: mock the `ai` SDK's generateText for the vision usage plumbing test.
// Must use vi.mock (hoisted); reading outer variables in the factory hoists wrong → return fixed usage directly in the mock factory.
// Real test verifies callVisionWithRetry, when imported, hooks up to the mocked generateText and gets the usage.
//
// V2.6.x Tier 1 #5: vision.ts migrated from generateObject (deprecated in v6)
// to generateText + Output.object. Mock follows: result.object → result.output,
// adds .text field per generateText shape. Usage shape stays v4 because
// normalizeUsage handles all variants — that's the point of the adapter.
const MOCK_USAGE = { promptTokens: 1000, completionTokens: 500, totalTokens: 1500 };
vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    // generateText mock: always returns valid productSchema (via .output) + fixed usage
    generateText: vi.fn().mockResolvedValue({
      output: {
        title: 'Mock 商品',
        description: 'Mock 描述用於測試 token usage 透傳',
        category: '其他',
        seo_tags: [],
        variants: [],
        price_twd: { min: 100, max: 200 },
        confidence: 0.9,
      },
      text: '',
      content: [],
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

// ProductAiMetadata is jsonb NOT NULL — give each test row a stub to satisfy the type
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
  // Two tenants: A uses default cap (5000), B uses lower cap (1000) to make over-cap easy to test
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

  // Ensure A/B import_sessions / ai_usage_events are clean (rescue if previous test run did not clean up)
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
  it('GPT-4o: 1M in + 1M out → $12.50 USD x 30 = 37500 NT cents', () => {
    // $2.50 + $10 = $12.50 USD x 30 TWD/USD x 100 cents/TWD = 37500 NT cents
    expect(tokenCost(1_000_000, 1_000_000)).toBeCloseTo(37500, 4);
  });

  it('GPT-4o: 200k in + 100k out → $1.50 USD x 30 = 4500 NT cents', () => {
    // (200000/1M)*2.5 + (100000/1M)*10 = $1.50 USD x 30 x 100 = 4500 NT cents
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
    // (1250 + 625 + 150) USD cents x 30 TWD/USD = 60750 NT cents
    expect(cost).toBe(60750);

    // cleanup for next test
    await dbAdmin.delete(importSessions).where(eq(importSessions.merchantId, TENANT_A));
  });

  it('returns 0 when tenant has no sessions today', async () => {
    const cost = await getDailyCostCents(TENANT_A);
    expect(cost).toBe(0);
  });

  // V1.5 smoke fix: sync photo upload uses ai_usage_events, not import_sessions
  it('includes ai_usage_events rows (sync photo upload path)', async () => {
    // 200k in + 100k out via ai_usage_events = 150 USD cents x 30 = 4500 NT cents
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

  // V1.5 smoke fix: same merchant same day, sum across import_sessions + ai_usage_events
  it('aggregates across import_sessions AND ai_usage_events', async () => {
    // import_sessions: 1M in + 1M out = 1250 USD cents x 30 = 37500 NT cents
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/agg-1',
      sourceType: 'ig',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });
    // ai_usage_events: 200k in + 100k out = 150 USD cents x 30 = 4500 NT cents
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
  // Doesn't test the atomic increment SQL on import_sessions.tokens_in/out — that needs more setup;
  // the focus here is proving vision.ts doesn't drop result.usage. The ingest worker writing it to DB
  // afterward is a trivial next step.
  it('callVisionWithRetry returns usage extracted from generateObject result', async () => {
    // Dynamic import to ensure vi.mock('ai') is wired
    const { callVisionWithRetry } = await import('@/lib/ai/vision');

    // Pass a buffer that won't be hit (generateObject is mocked, won't actually read image)
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
    // Tenant A blows its own cap — half via import_sessions, half via ai_usage_events
    // (mixing both sources also tests that the V1.5 smoke-fix dual-table aggregation respects tenant boundaries)
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

    // Confirm A actually blew it
    const aCost = await getDailyCostCents(TENANT_A);
    expect(aCost).toBeGreaterThan(5000); // > A's cap

    // B has no sessions → should be well under B's 1000 cap, no throw
    await expect(assertWithinDailyCap(TENANT_B)).resolves.toBeUndefined();

    // Reverse: B has small usage (mixing both sources) → also no throw
    // B cap = 1000 NT cents, 5k+1k tokens x 2 rows ~ 63 NT cents summed across both sources → well under cap
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

// V1.5 review M4: fixture demo image also counts as no_photo (aligned with list page hasImg condition)
describe('getHealthIssues — no_photo includes fixture path', () => {
  it('counts product with r2_key like %/fixtures/% as no_photo', async () => {
    // tenant A already created in outer beforeAll. First clean products, then insert 3 test rows:
    //   - 1 row r2_key = '' → no_photo (schema is NOT NULL; empty string means "not uploaded")
    //   - 1 row r2_key = 'test/fixtures/foo.jpg' → no_photo (new case, core of M4)
    //   - 1 row r2_key = '<tenantId>/abc.webp' → real upload, not counted
    // Expected: noPhoto count = 2
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
 * Differences vs per-tenant getDailyCostCents:
 *   - Cross-tenant aggregation (with top-N breakdown)
 *   - 14-day timeseries (GROUP BY TPE local date)
 *   - 2x anomaly flag
 *
 * Shares TENANT_A / TENANT_B, but each test cleans up itself to avoid polluting later tests.
 */
describe('V1.6 A9 — platform-wide cost aggregation', () => {
  // After each test, fully wipe import_sessions / ai_usage_events.
  //
  // Why "wipe all" not "wipe A/B": getPlatformCostToday / getCostTimeseries14d /
  // flagAnomaly are platform-wide aggregations — no tenant filter (that's what platform-wide
  // means). Any rows left over from other tests (e.g. tests/rls.e2e.test.ts T9 uses 99999999-... /
  // aaaaaaaa-... tenants for ai_usage_events writes) or manual operations (operator running
  // local upload) will contaminate the aggregation result.
  //
  // V2.6.2 retro discovery: if T9 seed crashes before afterAll runs, a row of 100+50 tokens stays
  // in local docker postgres forever, and every subsequent cost-cap run adds +23 cents that doesn't
  // match the expected value. CI uses ephemeral postgres so unaffected, but local dev is.
  //
  // Risk: if another test file is writing to these two tables in parallel, this wipe will step on it.
  // But vitest's default fork pool + isolation between files means in practice no other file writes
  // these tables while platform-agg describe runs.
  async function cleanupCostRows() {
    await dbAdmin.delete(importSessions);
    await dbAdmin.delete(aiUsageEvents);
  }

  it('getPlatformCostToday — sums across multiple tenants AND both source tables', async () => {
    await cleanupCostRows();

    // tenant A: import_sessions 1M+1M = 37500 NT cents + ai_usage_events 200k+100k = 4500
    //                                                         → A total 42000 cents
    // tenant B: ai_usage_events 500k+500k = (1.25+5)$=6.25 USD x30x100 = 18750 NT cents
    //                                                         → B total 18750 cents
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
    // A larger than B → ranks first
    expect(res.perTenantTopN[0]!.tenantId).toBe(TENANT_A);
    expect(res.perTenantTopN[0]!.cents).toBe(42000);
    expect(res.perTenantTopN[0]!.slug).toBe('cost-cap-a');
    expect(res.perTenantTopN[1]!.tenantId).toBe(TENANT_B);
    expect(res.perTenantTopN[1]!.cents).toBe(18750);

    await cleanupCostRows();
  });

  it('getCostTimeseries14d — returns 14 points with today aggregated correctly', async () => {
    await cleanupCostRows();

    // Today (TPE) insert 1M+1M = 37500 cents via import_sessions
    await dbAdmin.insert(importSessions).values({
      merchantId: TENANT_A,
      sourceUrl: 'https://test/timeseries',
      sourceType: 'ig',
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
    });

    const series = await getCostTimeseries14d();
    expect(series).toHaveLength(14);

    // Last point is today (order: 13 days ago → today, ascending)
    // Compare against TPE local date — using the same algorithm as the implementation
    const now = new Date();
    const tpeNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const todayLabel = `${tpeNow.getUTCFullYear()}-${String(tpeNow.getUTCMonth() + 1).padStart(2, '0')}-${String(tpeNow.getUTCDate()).padStart(2, '0')}`;

    expect(series[13]!.date).toBe(todayLabel);
    expect(series[13]!.cents).toBe(37500);

    // date strictly increasing (lexicographic on YYYY-MM-DD = chronological)
    for (let i = 1; i < series.length; i++) {
      expect(series[i]!.date > series[i - 1]!.date).toBe(true);
    }

    await cleanupCostRows();
  });

  it('flagAnomaly — returns isAnomaly:true when today > 2x prev_7d_avg', async () => {
    await cleanupCostRows();

    // Build baseline: past 7 days (excluding today), 1M+1M tokens per day = 37500 cents/day
    // → prev_7d_avg = 37500 cents, 2x threshold = 75000 cents
    // Explicitly back-date created_at 1-7 days ago (TPE) to avoid the "today" boundary
    const dayMs = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const baselineRows = Array.from({ length: 7 }, (_, i) => ({
      merchantId: TENANT_A,
      sourceUrl: `https://test/anomaly-baseline-${i}`,
      sourceType: 'ig' as const,
      tokensIn: 1_000_000,
      tokensOut: 1_000_000,
      // (i+1) days ago at this moment — ensures < today's TPE 00:00 boundary (unless "now" is exactly 00:00, a rare boundary this test accepts)
      createdAt: new Date(now - (i + 1) * dayMs),
    }));
    await dbAdmin.insert(importSessions).values(baselineRows);

    // Today insert 4M+4M tokens = 4 x 37500 = 150000 cents > 2 x 37500 = 75000 → anomaly
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

    // Bonus: confirm prev_7d_avg=0 → isAnomaly:false (insufficient baseline short-circuit)
    await cleanupCostRows();
    const empty = await flagAnomaly();
    expect(empty.isAnomaly).toBe(false);
    expect(empty.reason).toBe('基準資料不足');

    await cleanupCostRows();
  });
});
