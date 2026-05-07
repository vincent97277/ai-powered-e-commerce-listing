/**
 * V2.6.2 Tier 1 #6 — pricing math unit tests for tokenCost().
 *
 * Pure-function tests, no DB. Pin the cached-input-token billing math
 * in isolation so an SDK upgrade or pricing tweak fails loudly here
 * before it touches the aggregator tests in cost-cap.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { tokenCost, PRICING, USD_TO_TWD } from '@/lib/observability/ai-cost-pricing';

describe('tokenCost — uncached path (current default)', () => {
  it('1M in + 1M out → 37500 NT cents', () => {
    expect(tokenCost(1_000_000, 1_000_000)).toBeCloseTo(37500, 4);
  });

  it('200k in + 100k out → 4500 NT cents', () => {
    expect(tokenCost(200_000, 100_000)).toBeCloseTo(4500, 4);
  });

  it('zero tokens → 0 cents', () => {
    expect(tokenCost(0, 0)).toBe(0);
  });

  it('cachedInputTokens defaults to 0 (preserves existing caller behavior)', () => {
    // Same as 1M+1M with default param — same number, ensures default is 0.
    expect(tokenCost(1_000_000, 1_000_000, 0)).toBeCloseTo(
      tokenCost(1_000_000, 1_000_000),
      4,
    );
  });
});

describe('tokenCost — cached input billing (V2.6.2)', () => {
  it('100% cached input bills at 50% rate', () => {
    // 1M input fully cached + 0 output:
    //   uncached = 0, cached = 1M
    //   usd = 1_000_000 * 0.5 / 1_000_000 * 2.5 = $1.25
    //   cents = $1.25 * 30 * 100 = 3750
    expect(tokenCost(1_000_000, 0, 1_000_000)).toBeCloseTo(3750, 4);
  });

  it('0% cached → same as uncached path', () => {
    expect(tokenCost(1_000_000, 1_000_000, 0)).toBeCloseTo(37500, 4);
  });

  it('50% cached input — math: uncached + (cached × discount)', () => {
    // 1M input, 500k cached + 500k uncached, 0 output:
    //   uncached USD = 500_000 / 1_000_000 * 2.5 = $1.25
    //   cached USD   = 500_000 * 0.5 / 1_000_000 * 2.5 = $0.625
    //   total = $1.875 USD * 30 * 100 = 5625 cents
    expect(tokenCost(1_000_000, 0, 500_000)).toBeCloseTo(5625, 4);
  });

  it('cached + output: only input rate gets the discount, output unchanged', () => {
    // 1M input, all cached + 1M output:
    //   input USD  = 1_000_000 * 0.5 / 1_000_000 * 2.5 = $1.25
    //   output USD = 1_000_000 / 1_000_000 * 10 = $10
    //   total = $11.25 * 30 * 100 = 33750 cents
    expect(tokenCost(1_000_000, 1_000_000, 1_000_000)).toBeCloseTo(33750, 4);
  });

  it('clamps cachedInputTokens > tokensIn (defensive against bad SDK data)', () => {
    // Bad input: cached=2M but total=1M. Should treat as cached=1M.
    // Same answer as 100%-cached test above.
    expect(tokenCost(1_000_000, 0, 2_000_000)).toBeCloseTo(3750, 4);
  });

  it('clamps negative cachedInputTokens → 0 (defensive)', () => {
    // Should behave as if cached=0.
    expect(tokenCost(1_000_000, 1_000_000, -500)).toBeCloseTo(37500, 4);
  });
});

describe('tokenCost — pricing constants are consistent', () => {
  it('cachedInputDiscountFactor is 0.5 (OpenAI cache rate as of 2026)', () => {
    expect(PRICING.cachedInputDiscountFactor).toBe(0.5);
  });

  it('input rate × USD_TO_TWD × 100 × 1M = 7500 NT cents per 1M cached input', () => {
    // 1M cached at 50% = 1.25 USD * 30 TWD * 100 cents = 3750 cents
    expect(tokenCost(1_000_000, 0, 1_000_000)).toBeCloseTo(
      PRICING.inputPerMillion * PRICING.cachedInputDiscountFactor * USD_TO_TWD * 100,
      4,
    );
  });
});
