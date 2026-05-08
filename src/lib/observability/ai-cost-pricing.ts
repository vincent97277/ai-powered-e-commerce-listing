/**
 * AI cost pricing — sole source of truth for AI cost math
 *
 * Why a separate file (V1.6 Track A9 prep):
 *   - ai-cost.ts (per-tenant daily cap enforcement) and ai-cost-platform.ts (platform-wide
 *     dashboard aggregation, A9) both apply the same pricing + USD/TWD conversion.
 *   - If both sides hardcoded USD_TO_TWD = 30 / PRICING constants independently, any change
 *     would silently drift → the number guarded by daily cap ≠ the number shown on dashboard.
 *   - Centralized here; both consumers import. Single point of change, platform-wide consistency.
 *
 * No query / IO code — pure pricing math, easy to unit-test (covered by cost-cap.test.ts).
 */

/* ─────────────────────────── Pricing constants ─────────────────────────── */

/** Price per 1M tokens (USD) — gpt-4o-2024-11-20 */
export const PRICING = {
  inputPerMillion: 2.5,
  outputPerMillion: 10,
  /**
   * V2.6.2: cached input tokens bill at 50% of the input rate.
   * OpenAI auto-caches prompts ≥ 1024 tokens (our system prompt qualifies).
   * Cache hits return the same tokens but billed at half — relevant after
   * the first request of a session against the same system prompt.
   *
   * Source: https://platform.openai.com/docs/guides/prompt-caching
   *
   * Currently NO callers pass cachedInputTokens (column doesn't exist on
   * ai_usage_events / import_sessions). When V2.7+ adds the column +
   * worker writes, this constant kicks in. Keeping the math here so the
   * one place is the only place to update if OpenAI changes the rate.
   */
  cachedInputDiscountFactor: 0.5,
} as const;

/**
 * USD → TWD conversion rate (hardcoded ≈ 30; dynamic FX in V2).
 * Impact: tokenCost returns cents in "NT$ cents" — aligned with merchants.dailyAiCostCentsCap unit.
 */
export const USD_TO_TWD = 30;

/**
 * Compute a single session's cost (NT$ cents, float — don't round here; round only after
 * summation to avoid accumulated error).
 *
 * Units: 1 cent = NT$0.01. 5000 cents = NT$50.
 *   e.g. 1540 input + 79 output tokens = $0.00465 USD ≈ NT$0.14 ≈ 14 cents
 *
 * V2.6.2: optional cachedInputTokens param. When OpenAI returns a usage
 * report with cached input tokens (gpt-4o auto-caches system prompts
 * ≥ 1024 tokens — ours qualifies), those tokens billed at 50% rate.
 *
 * `cachedInputTokens` is a SUBSET of `tokensIn`. Caller passes the
 * raw OpenAI value. We rebate the cached portion from the full-rate
 * billing here:
 *   uncachedIn   = tokensIn - cachedInputTokens
 *   inputUsd     = uncachedIn * inputRate + cachedInputTokens * inputRate * discount
 *
 * Defaults to 0 — current callers (ai-cost.ts, ai-cost-platform.ts) read
 * from columns that don't exist yet. V2.7+ adds the migration + worker
 * writes; until then we conservatively over-charge ourselves up to 50%
 * on the cache-hit fraction. Never under-charges.
 */
export function tokenCost(
  tokensIn: number,
  tokensOut: number,
  cachedInputTokens = 0,
): number {
  // Defensive: cap cached at total input. OpenAI shouldn't return cached >
  // total but a future SDK shape change shouldn't break the math.
  const cachedClamped = Math.max(0, Math.min(cachedInputTokens, tokensIn));
  const uncachedIn = tokensIn - cachedClamped;
  const inputUsd =
    ((uncachedIn + cachedClamped * PRICING.cachedInputDiscountFactor) / 1_000_000) *
    PRICING.inputPerMillion;
  const outputUsd = (tokensOut / 1_000_000) * PRICING.outputPerMillion;
  return (inputUsd + outputUsd) * USD_TO_TWD * 100; // NT$ cents
}
