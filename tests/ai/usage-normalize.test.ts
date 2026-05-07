/**
 * V2.6.2 prep — pin the AI SDK usage normalizer against fixtures from each
 * major shape. If a future SDK bump renames a field again, the failing test
 * is the bisect anchor — not a silent platform-wide cost-cap zeroing.
 */
import { describe, it, expect } from 'vitest';
import { normalizeUsage } from '@/lib/ai/usage-normalize';

describe('normalizeUsage — v4 shape (current)', () => {
  it('reads promptTokens / completionTokens', () => {
    const v4Usage = {
      promptTokens: 1234,
      completionTokens: 567,
      totalTokens: 1801,
    };
    expect(normalizeUsage(v4Usage)).toEqual({
      tokensIn: 1234,
      tokensOut: 567,
      cachedInputTokens: 0,
    });
  });

  it('zero-fills missing fields', () => {
    expect(normalizeUsage({ promptTokens: 100 })).toEqual({
      tokensIn: 100,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });
});

describe('normalizeUsage — v5 shape', () => {
  it('reads inputTokens / outputTokens', () => {
    const v5Usage = {
      inputTokens: 1234,
      outputTokens: 567,
      totalTokens: 1801,
    };
    expect(normalizeUsage(v5Usage)).toEqual({
      tokensIn: 1234,
      tokensOut: 567,
      cachedInputTokens: 0,
    });
  });

  it('captures cachedInputTokens when present', () => {
    const v5UsageCached = {
      inputTokens: 1500,
      outputTokens: 400,
      cachedInputTokens: 1024,
      totalTokens: 1900,
    };
    expect(normalizeUsage(v5UsageCached)).toEqual({
      tokensIn: 1500,
      tokensOut: 400,
      cachedInputTokens: 1024,
    });
  });

  it('prefers v5 names over v4 if both present (defensive against transition)', () => {
    const mixed = {
      inputTokens: 999,
      outputTokens: 111,
      promptTokens: 1, // would lose if we picked v4 — assert we don't
      completionTokens: 2,
    };
    expect(normalizeUsage(mixed)).toEqual({
      tokensIn: 999,
      tokensOut: 111,
      cachedInputTokens: 0,
    });
  });
});

describe('normalizeUsage — v6 shape', () => {
  it('reads inputTokenDetails.cacheReadTokens for cached input', () => {
    const v6Usage = {
      inputTokens: 1800,
      outputTokens: 320,
      totalTokens: 2120,
      inputTokenDetails: {
        cacheReadTokens: 1280,
      },
    };
    expect(normalizeUsage(v6Usage)).toEqual({
      tokensIn: 1800,
      tokensOut: 320,
      cachedInputTokens: 1280,
    });
  });

  it('handles inputTokenDetails without cacheReadTokens', () => {
    const v6UsageNoCache = {
      inputTokens: 800,
      outputTokens: 100,
      inputTokenDetails: {},
    };
    expect(normalizeUsage(v6UsageNoCache)).toEqual({
      tokensIn: 800,
      tokensOut: 100,
      cachedInputTokens: 0,
    });
  });

  it('handles inputTokenDetails being null', () => {
    const v6UsageNullDetails = {
      inputTokens: 800,
      outputTokens: 100,
      inputTokenDetails: null,
    };
    expect(normalizeUsage(v6UsageNullDetails)).toEqual({
      tokensIn: 800,
      tokensOut: 100,
      cachedInputTokens: 0,
    });
  });
});

describe('normalizeUsage — defensive coercion', () => {
  it('returns zeros for null', () => {
    expect(normalizeUsage(null)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for undefined', () => {
    expect(normalizeUsage(undefined)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for non-object input', () => {
    expect(normalizeUsage('hello')).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
    expect(normalizeUsage(42)).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('returns zeros for empty object', () => {
    expect(normalizeUsage({})).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('coerces non-numeric token fields to 0', () => {
    expect(
      normalizeUsage({
        promptTokens: 'oops' as unknown as number,
        completionTokens: NaN,
      }),
    ).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('rejects negative token counts', () => {
    expect(
      normalizeUsage({
        inputTokens: -100,
        outputTokens: -50,
      }),
    ).toEqual({
      tokensIn: 0,
      tokensOut: 0,
      cachedInputTokens: 0,
    });
  });

  it('rejects Infinity', () => {
    expect(
      normalizeUsage({
        inputTokens: Infinity,
        outputTokens: 100,
      }),
    ).toEqual({
      tokensIn: 0,
      tokensOut: 100,
      cachedInputTokens: 0,
    });
  });
});

describe('normalizeUsage — bisect anchor for SDK upgrades', () => {
  it('this test intentionally overlaps with vision.ts to catch silent zeroing', () => {
    // If an SDK upgrade renames the field again and vision.ts still calls
    // normalizeUsage(result.usage), the type-check + this test together force
    // a visible diff at the call site rather than a silent prod regression.
    const realisticV5 = {
      inputTokens: 1547,
      outputTokens: 412,
      cachedInputTokens: 0,
      totalTokens: 1959,
    };
    const out = normalizeUsage(realisticV5);
    expect(out.tokensIn).toBeGreaterThan(0);
    expect(out.tokensOut).toBeGreaterThan(0);
    // Specifically: confirm we are NOT silently returning zeros.
    expect(out.tokensIn).toBe(1547);
    expect(out.tokensOut).toBe(412);
  });
});
