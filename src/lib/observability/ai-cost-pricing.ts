/**
 * AI cost pricing — sole source of truth for AI cost math
 *
 * 為什麼獨立成檔 (V1.6 Track A9 prep):
 *   - ai-cost.ts (per-tenant daily cap enforcement) 與 ai-cost-platform.ts (platform-wide
 *     dashboard aggregation, A9) 都要套同一組 pricing + USD/TWD 換算
 *   - 若兩邊各自寫死 USD_TO_TWD = 30 / PRICING constants, 任何一邊調整都會 silently drift
 *     → 造成 daily cap 守的數字 ≠ dashboard 顯示的數字
 *   - 集中放這, 兩個 consumer 都 import. 改動單點, 全平台一致
 *
 * 不放任何 query / IO 相關 code, 純 pricing math, 方便 unit test (cost-cap.test.ts 已涵蓋).
 */

/* ─────────────────────────── Pricing constants ─────────────────────────── */

/** 每 1M token 的價格 (USD) — gpt-4o-2024-11-20 */
export const PRICING = {
  inputPerMillion: 2.5,
  outputPerMillion: 10,
} as const;

/**
 * USD → TWD 換算率 (寫死 ≈ 30, V2 再上動態匯率)
 * 影響: tokenCost 回傳的 cents 是「NT$ cents」, 對齊 merchants.dailyAiCostCentsCap 單位
 */
export const USD_TO_TWD = 30;

/**
 * 算單筆 session 的成本 (NT$ cents, float — 不在這 round, 加總後再 round 避免累積誤差)
 *
 * 單位: 1 cent = NT$0.01. 5000 cents = NT$50.
 *   舉例: 1540 input + 79 output tokens = $0.00465 USD ≈ NT$0.14 ≈ 14 cents
 */
export function tokenCost(tokensIn: number, tokensOut: number): number {
  const usd =
    (tokensIn / 1_000_000) * PRICING.inputPerMillion +
    (tokensOut / 1_000_000) * PRICING.outputPerMillion;
  return usd * USD_TO_TWD * 100; // NT$ cents
}
