/**
 * AI cost cap enforcement (V1.5 Track A2, RA13)
 *
 * 對 import_sessions.tokensIn/tokensOut + ai_usage_events.tokensIn/tokensOut 做日累計,
 * 超過 merchants.dailyAiCostCentsCap (default NT$50 = 5000 cents) → 擋下後續 AI 呼叫
 *
 * 為什麼兩張表加總 (V1.5 smoke fix):
 *   - import_sessions: IG/蝦皮 batch import worker 寫入 (RA13 原始路徑)
 *   - ai_usage_events:  同步 photo upload (/api/products/generate) 寫入
 *     → 沒這張表的話 sync path 完全沒記錄, DailyCostChip 永遠 NT$0
 *   - 兩個 source-of-truth 不重複 (sync 不寫 import_sessions, batch 不寫 ai_usage_events)
 *
 * 為什麼 dbAdmin:
 *   - admin observability 範疇 (跨 worker / sync API / 設定頁三處讀)
 *   - 路徑 src/lib/observability/** 已在 eslint.config.mjs:54 allowlist
 *   - 不寫資料 (純讀 + 計算), 不會洩漏 cross-tenant 資料 (永遠 WHERE tenant_id = $1)
 *
 * Pricing 寫死 (V1.5 不上 admin override UI, V2 再說):
 *   - GPT-4o (gpt-4o-2024-11-20): $2.50 / $10 per 1M tokens
 *   - 圖片在 OpenAI 是當 input token 算
 *     → 不在這邊另外加, 直接信任 tokensIn 已含圖片成本
 *
 * 時區: 台灣 UTC+8 — 「今日」= TPE 00:00 → now
 *   created_at 是 timestamptz, 所以比對時轉到 TPE 算 boundary
 */
import { eq, and, gte } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants, importSessions, aiUsageEvents } from '@/db/schema';
import { tokenCost } from './ai-cost-pricing';

// V1.6 A9 prep: pricing math 移至 ai-cost-pricing.ts (見該檔 docstring).
// 這邊 re-export tokenCost 維持 backward compat — cost-cap.test.ts 仍從 '@/lib/observability/ai-cost' import.
export { tokenCost };

/* ─────────────────────────── Daily window helper ─────────────────────────── */

/**
 * 拿台灣時區「今日 00:00」對應的 UTC Date object
 * Asia/Taipei 是固定 UTC+8 (沒夏令時間), 直接 -8h 算
 */
function getTpeMidnightUtc(now: Date = new Date()): Date {
  // TPE = UTC + 8h. 想知道「TPE 的 Y/M/D」就把 now 加 8h 後拿 UTC date components
  const tpe = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const y = tpe.getUTCFullYear();
  const m = tpe.getUTCMonth();
  const d = tpe.getUTCDate();
  // 構回「TPE 該日 00:00」對應的 UTC 時間 = (Y-M-D 00:00 UTC) - 8h
  const tpeMidnightAsUtcMs = Date.UTC(y, m, d, 0, 0, 0, 0) - 8 * 60 * 60 * 1000;
  return new Date(tpeMidnightAsUtcMs);
}

/* ─────────────────────────── Daily cost aggregator ─────────────────────────── */

/**
 * 加總某商家「今日 (TPE)」所有 AI 呼叫的 token cost (cents, integer)
 *
 * 來源兩張表 (互不重疊 — 見檔頭 docstring):
 *   1. import_sessions  (IG/蝦皮 batch worker)
 *   2. ai_usage_events  (sync photo upload /api/products/generate)
 *
 * 兩個 query 並行打 (Promise.all), 同一個 since boundary
 * 不用 UNION ALL 是因為兩張表 schema 不同 (import_sessions 還有 source_url 等欄位),
 * 各自 SELECT tokens_in/out 對 driver 比較單純, perf 也沒差 (兩個都吃 tenant_created idx)
 */
export async function getDailyCostCents(tenantId: string): Promise<number> {
  const since = getTpeMidnightUtc();

  const [importRows, eventRows] = await Promise.all([
    dbAdmin
      .select({
        tokensIn: importSessions.tokensIn,
        tokensOut: importSessions.tokensOut,
      })
      .from(importSessions)
      .where(
        and(
          eq(importSessions.merchantId, tenantId),
          gte(importSessions.createdAt, since),
        ),
      ),
    dbAdmin
      .select({
        tokensIn: aiUsageEvents.tokensIn,
        tokensOut: aiUsageEvents.tokensOut,
      })
      .from(aiUsageEvents)
      .where(
        and(
          eq(aiUsageEvents.tenantId, tenantId),
          gte(aiUsageEvents.createdAt, since),
        ),
      ),
  ]);

  let totalCents = 0;
  for (const r of importRows) {
    totalCents += tokenCost(r.tokensIn ?? 0, r.tokensOut ?? 0);
  }
  for (const r of eventRows) {
    totalCents += tokenCost(r.tokensIn ?? 0, r.tokensOut ?? 0);
  }
  return Math.round(totalCents);
}

/* ─────────────────────────── Cap enforcement ─────────────────────────── */

export class CapExceededError extends Error {
  readonly code = 'AI_COST_CAP_EXCEEDED' as const;
  readonly usedCents: number;
  readonly capCents: number;

  constructor(usedCents: number, capCents: number) {
    super(
      `今日 AI 額度已達上限: NT$${Math.floor(usedCents / 100)} / NT$${Math.floor(capCents / 100)} (TPE 當日)`,
    );
    this.name = 'CapExceededError';
    this.usedCents = usedCents;
    this.capCents = capCents;
  }
}

/**
 * 拿商家 dailyAiCostCentsCap (default 5000 cents)
 * tenantId 不存在時 throw — 上游應該已驗證過, 不會觸發
 */
async function getCap(tenantId: string): Promise<number> {
  const [row] = await dbAdmin
    .select({ cap: merchants.dailyAiCostCentsCap })
    .from(merchants)
    .where(eq(merchants.id, tenantId))
    .limit(1);
  if (!row) {
    throw new Error(`[ai-cost] merchant ${tenantId} 不存在`);
  }
  return row.cap;
}

/**
 * 守門 — 在每次 AI 入口呼叫前 await assertWithinDailyCap(tenantId)
 * 超過 cap → throw CapExceededError (caller 接住後回 429 / mark session failed)
 *
 * 注意: race condition 不在這擋 (兩個 request 同時打進來都看到 used < cap 都通過,
 *       兩件都跑完後 used 才超 cap). V1.5 接受這個 over-shoot, 反正下一個 request 會被擋
 *       要嚴格的話得用 advisory lock 或 atomic check-and-add — V2 再說
 */
export async function assertWithinDailyCap(tenantId: string): Promise<void> {
  const [usedCents, capCents] = await Promise.all([
    getDailyCostCents(tenantId),
    getCap(tenantId),
  ]);
  if (usedCents >= capCents) {
    throw new CapExceededError(usedCents, capCents);
  }
}

/**
 * 設定頁 / dashboard 顯示用 — 拿 (used, cap) tuple, 不 throw
 */
export async function getDailyCostSnapshot(
  tenantId: string,
): Promise<{ usedCents: number; capCents: number }> {
  const [usedCents, capCents] = await Promise.all([
    getDailyCostCents(tenantId),
    getCap(tenantId),
  ]);
  return { usedCents, capCents };
}

/**
 * 暴露 getTpeMidnightUtc 給 test (避免 test 重新算 boundary 時誤差)
 */
export const __test = { getTpeMidnightUtc };
