/**
 * AI SDK usage shape normalizer — V2.6.2 prep.
 *
 * Purpose: insulate `vision.ts` from the AI SDK's `result.usage` field renames
 * across major versions. v5 renamed `promptTokens`/`completionTokens` to
 * `inputTokens`/`outputTokens`; v6 added `inputTokenDetails.cacheReadTokens`
 * for the 50%-billed cached-prompt fraction.
 *
 * If `vision.ts` reads `result.usage.promptTokens` directly and we bump the
 * SDK to v5, those reads return `undefined`, the worker writes `tokensIn=0,
 * tokensOut=0`, `hasUsage` evaluates false, the cost cap silently stops
 * tracking AI spend platform-wide. Type-check-green, unit-test-green, prod-
 * broken. This module is the safety net.
 *
 * Lands BEFORE any version bump. Version bump becomes a one-liner in
 * vision.ts (the call site is already going through this adapter).
 *
 * Shapes supported:
 *   v4: { promptTokens, completionTokens, totalTokens? }
 *   v5: { inputTokens, outputTokens, totalTokens?, cachedInputTokens? }
 *   v6: { inputTokens, outputTokens, totalTokens?, inputTokenDetails: { cacheReadTokens? } }
 *
 * Behavior:
 *   - Returns { tokensIn, tokensOut, cachedInputTokens? } regardless of source shape.
 *   - cachedInputTokens defaults to 0 if not reported — safe for cost-cap math.
 *   - undefined / null / wrong-type input → { tokensIn: 0, tokensOut: 0 } (matches
 *     the existing failure-path return shape in vision.ts:181).
 */

export type VisionUsage = {
  tokensIn: number;
  tokensOut: number;
  /**
   * V2.6.2: cached input tokens (OpenAI bills these at 50% of normal input rate).
   * Always populated to a number; 0 when the SDK didn't report cache hits or the
   * model doesn't support caching. Cost-cap math today charges all input at full
   * price — this field is wired through for a future pricing refinement without
   * requiring a second migration.
   */
  cachedInputTokens: number;
};

/**
 * Best-effort number coercion. Anything that isn't a finite, non-negative
 * number resolves to 0. Defensive against SDK changes that shift a field to
 * string-typed (unlikely but cheap to guard).
 */
function toNumber(value: unknown): number {
  if (typeof value !== 'number') return 0;
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

type UnknownUsage = {
  promptTokens?: unknown;
  completionTokens?: unknown;
  inputTokens?: unknown;
  outputTokens?: unknown;
  cachedInputTokens?: unknown;
  inputTokenDetails?: { cacheReadTokens?: unknown } | unknown;
};

export function normalizeUsage(raw: unknown): VisionUsage {
  if (raw === null || typeof raw !== 'object') {
    return { tokensIn: 0, tokensOut: 0, cachedInputTokens: 0 };
  }

  const u = raw as UnknownUsage;

  // v5+ uses inputTokens/outputTokens; v4 uses promptTokens/completionTokens.
  // Prefer v5+ names (the future), fall back to v4 names (current).
  const tokensIn = toNumber(u.inputTokens) || toNumber(u.promptTokens);
  const tokensOut = toNumber(u.outputTokens) || toNumber(u.completionTokens);

  // v5 exposes cachedInputTokens directly; v6 nests under inputTokenDetails.
  const v5Cached = toNumber(u.cachedInputTokens);
  const v6Cached =
    typeof u.inputTokenDetails === 'object' && u.inputTokenDetails !== null
      ? toNumber((u.inputTokenDetails as { cacheReadTokens?: unknown }).cacheReadTokens)
      : 0;

  return {
    tokensIn,
    tokensOut,
    cachedInputTokens: v5Cached || v6Cached,
  };
}
