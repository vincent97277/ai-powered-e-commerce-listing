/**
 * AI cost cap enforcement (V1.5 Track A2, RA13)
 *
 * 對 import_sessions.tokensIn/tokensOut 做日累計, 超過
 * merchants.dailyAiCostCentsCap (default NT$50 = 5000 cents) → 擋下後續 AI 呼叫
 *
 * 為什麼 dbAdmin:
 *   - admin observability 範疇 (跨 worker / sync API / 設定頁三處讀)
 *   - 路徑 src/lib/observability/** 已在 eslint.config.mjs:54 allowlist
 *   - 不寫資料 (純讀 + 計算), 不會洩漏 cross-tenant 資料 (永遠 WHERE merchant_id = $1)
 *
 * Pricing 寫死 (V1.5 不上 admin override UI, V2 再說):
 *   - Gemini 2.5 Flash: $0.30 / $2.50 per 1M tokens
 *   - GPT-4o:           $2.50 / $10  per 1M tokens
 *   - 圖片在兩家都是當 input token 算 (Gemini 約 258 tokens / 1024px image)
 *     → 不在這邊另外加, 直接信任 import_sessions.tokensIn 已含圖片成本
 *
 * 時區: 台灣 UTC+8 — 「今日」= TPE 00:00 → now
 *   import_sessions.created_at 是 timestamptz, 所以比對時轉到 TPE 算 boundary
 *
 * Old rows fallback: A1 之前的 session 沒寫 provider 欄位, 預設 'gemini' (跟 A1 default 一致, 也比較保守 — Gemini 比 OpenAI 便宜, 算出來金額較小, 不會誤觸 cap)
 */
import { eq, and, gte } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { merchants, importSessions } from '@/db/schema';

/* ─────────────────────────── Pricing constants ─────────────────────────── */

/** 每 1M token 的價格 (USD); cent = USD * 100 */
const PRICING = {
  gemini: {
    inputPerMillion: 0.3,
    outputPerMillion: 2.5,
  },
  openai: {
    inputPerMillion: 2.5,
    outputPerMillion: 10,
  },
} as const;

export type AiProviderName = keyof typeof PRICING;

/**
 * 算單筆 session 的成本 (cents, float — 不在這 round, 加總後再 round 避免累積誤差)
 *
 * V1.5 review H3: 拿掉 dead `_model` 參數 — 目前只用 provider 區分價格,
 *                 V2 真要 per-model SKU 再加, YAGNI.
 */
export function tokenCost(
  provider: AiProviderName | string,
  tokensIn: number,
  tokensOut: number,
): number {
  const p = (provider in PRICING ? provider : 'gemini') as AiProviderName;
  const rates = PRICING[p];
  const usd =
    (tokensIn / 1_000_000) * rates.inputPerMillion +
    (tokensOut / 1_000_000) * rates.outputPerMillion;
  return usd * 100; // cents
}

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
 * 加總某商家「今日 (TPE)」所有 import_sessions 的 token cost (cents, integer)
 */
export async function getDailyCostCents(tenantId: string): Promise<number> {
  const since = getTpeMidnightUtc();

  const rows = await dbAdmin
    .select({
      tokensIn: importSessions.tokensIn,
      tokensOut: importSessions.tokensOut,
      provider: importSessions.provider,
    })
    .from(importSessions)
    .where(
      and(
        eq(importSessions.merchantId, tenantId),
        gte(importSessions.createdAt, since),
      ),
    );

  let totalCents = 0;
  for (const r of rows) {
    totalCents += tokenCost(r.provider ?? 'gemini', r.tokensIn ?? 0, r.tokensOut ?? 0);
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
 * V1.5 review H3: 拿掉 dead `sql` re-export — 從來沒人用過.
 */
export const __test = { getTpeMidnightUtc };
