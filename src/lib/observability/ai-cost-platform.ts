/**
 * Platform-wide AI cost aggregation (V1.6 Track A9)
 *
 * 跟 ai-cost.ts 的差異:
 *   - ai-cost.ts:  per-tenant 守 daily cap (每次 AI 呼叫前 check)
 *   - 這檔:        cross-tenant dashboard query (admin 看全平台用量)
 *
 * 為什麼 dbAdmin:
 *   - 跨 tenant 視角, 沒有單一 tenant_id 可綁
 *   - src/lib/observability/** 已在 eslint.config.mjs allowlist
 *   - 純讀, 不寫 (回傳 aggregated 數字, 不會 leak per-row 資料)
 *
 * 為什麼跟 ai-cost.ts 兩張表都要查 (UNION ALL):
 *   - import_sessions:  IG/蝦皮 batch import worker 寫入
 *   - ai_usage_events:  sync photo upload (/api/products/generate) 寫入
 *   - 兩源不重疊 (sync 不寫 import_sessions, batch 不寫 ai_usage_events)
 *   - 不查任何一張就會少算, dashboard 數字 ≠ 實際扣款
 *
 * Pricing 共用 ai-cost-pricing.ts (見該檔 docstring) — single source of truth.
 *
 * 時區: TPE 邊界 reuse __test.getTpeMidnightUtc 避免兩處算 boundary 各自漂移.
 */
import { sql } from 'drizzle-orm';
import { dbAdmin } from '@/db/admin-only';
import { tokenCost } from './ai-cost-pricing';
import { __test as aiCostInternals } from './ai-cost';

const { getTpeMidnightUtc } = aiCostInternals;

/* ─────────────────────────── Types ─────────────────────────── */

export type PlatformCostToday = {
  totalCents: number;
  perTenantTopN: { tenantId: string; slug: string; name: string; cents: number }[];
};

export type CostTimeseriesPoint = {
  /** YYYY-MM-DD (TPE local date) */
  date: string;
  cents: number;
};

export type AnomalyFlag = {
  isAnomaly: boolean;
  todayCents: number;
  prev7dAvgCents: number;
  /** 中文敘述, UI 直接吃 (e.g. '今日 > 2× 過去 7 天平均') */
  reason?: string;
};

/* ─────────────────────────── Helpers ─────────────────────────── */

/**
 * TPE 當日 00:00 起算的 UTC date - n 天
 *
 * 用 getTpeMidnightUtc 拿今天 TPE 邊界, 再減 n*24h. 因為 TPE 沒夏令時間,
 * 24h 步長不會跨越 DST 邊界, 所以「往回 n 天」= 減 n × 86400s 是安全的.
 */
function tpeDaysAgoUtc(daysAgo: number): Date {
  const today = getTpeMidnightUtc();
  return new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

/* ─────────────────────────── Today's cost (platform-wide + top-N tenants) ─────────────────────────── */

/**
 * 今日 (TPE) 全平台 AI 用量 + Top-N tenant breakdown
 *
 * 兩個 source 各自 GROUP BY tenant_id 後 UNION 加總, 再 JOIN merchants 拿 slug/name.
 * Top-N: 按 cents 排序取前 N (default 10).
 */
export async function getPlatformCostToday(limit = 10): Promise<PlatformCostToday> {
  const since = getTpeMidnightUtc();

  // 為什麼 SUM(tokens_in) / SUM(tokens_out) 在 SQL 算, 然後到 JS 再套 tokenCost():
  //   tokenCost 是 float math (USD → TWD × 100 cents), 在 SQL 用 numeric 也行但
  //   pricing 算式只在一處集中 (ai-cost-pricing.ts) 比較好維護
  //
  // 為什麼用 raw sql 而不是 drizzle query builder:
  //   GROUP BY + JOIN merchants + UNION ALL combined query 用 sql`` template
  //   比較直觀, 也跟 admin/page.tsx 的 ranking query 同 pattern
  const rows = await dbAdmin.execute<{
    tenant_id: string;
    slug: string;
    name: string;
    tokens_in: string | number;
    tokens_out: string | number;
  }>(sql`
    WITH today_usage AS (
      SELECT merchant_id AS tenant_id,
             SUM(tokens_in) AS tokens_in,
             SUM(tokens_out) AS tokens_out
      FROM import_sessions
      WHERE created_at >= ${since}
      GROUP BY merchant_id
      UNION ALL
      SELECT tenant_id,
             SUM(tokens_in) AS tokens_in,
             SUM(tokens_out) AS tokens_out
      FROM ai_usage_events
      WHERE created_at >= ${since}
      GROUP BY tenant_id
    ),
    summed AS (
      SELECT tenant_id,
             SUM(tokens_in)::bigint AS tokens_in,
             SUM(tokens_out)::bigint AS tokens_out
      FROM today_usage
      GROUP BY tenant_id
    )
    SELECT s.tenant_id,
           m.slug,
           m.name,
           s.tokens_in,
           s.tokens_out
    FROM summed s
    JOIN merchants m ON m.id = s.tenant_id
  `);

  const perTenant = (rows.rows as Array<{
    tenant_id: string;
    slug: string;
    name: string;
    tokens_in: string | number;
    tokens_out: string | number;
  }>).map((r) => ({
    tenantId: r.tenant_id,
    slug: r.slug,
    name: r.name,
    cents: Math.round(tokenCost(Number(r.tokens_in ?? 0), Number(r.tokens_out ?? 0))),
  }));

  // total = sum across all tenants (含未進 top-N 的)
  const totalCents = perTenant.reduce((s, t) => s + t.cents, 0);

  // top-N (cents desc, tie-break by name asc 維持穩定 ordering)
  const perTenantTopN = [...perTenant]
    .sort((a, b) => (b.cents - a.cents) || a.name.localeCompare(b.name))
    .slice(0, limit);

  return { totalCents, perTenantTopN };
}

/* ─────────────────────────── 14-day timeseries ─────────────────────────── */

/**
 * 過去 14 天每日 (TPE local date) 全平台 AI 用量
 *
 * 回傳 14 個 point (含 0 days 也補上), 從 13 天前 → 今天, 順序遞增.
 * UI 直接 .map 畫 bar chart.
 *
 * GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') —
 * Postgres 的 AT TIME ZONE 把 timestamptz 轉到 TPE 當地時間後再 truncate 到日,
 * 跟「TPE 當日 00:00 起算」邊界一致.
 */
export async function getCostTimeseries14d(): Promise<CostTimeseriesPoint[]> {
  // 14 天前的 TPE 00:00 (= 13 天前的「整天」起點 + 今天 = 共 14 天)
  const since = tpeDaysAgoUtc(13);

  const rows = await dbAdmin.execute<{
    day: string;
    tokens_in: string | number;
    tokens_out: string | number;
  }>(sql`
    WITH usage AS (
      SELECT created_at, tokens_in, tokens_out
      FROM import_sessions
      WHERE created_at >= ${since}
      UNION ALL
      SELECT created_at, tokens_in, tokens_out
      FROM ai_usage_events
      WHERE created_at >= ${since}
    )
    SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei'), 'YYYY-MM-DD') AS day,
           SUM(tokens_in)::bigint AS tokens_in,
           SUM(tokens_out)::bigint AS tokens_out
    FROM usage
    GROUP BY day
  `);

  const map = new Map<string, number>();
  for (const r of rows.rows as Array<{
    day: string;
    tokens_in: string | number;
    tokens_out: string | number;
  }>) {
    const cents = Math.round(tokenCost(Number(r.tokens_in ?? 0), Number(r.tokens_out ?? 0)));
    map.set(r.day, cents);
  }

  // 補 0 (沒事件的日子) — 走 14 個 TPE local date
  const out: CostTimeseriesPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = tpeDaysAgoUtc(i);
    // 把 d (UTC midnight TPE) 轉回 TPE 當地的 YYYY-MM-DD label
    const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const label = `${tpe.getUTCFullYear()}-${String(tpe.getUTCMonth() + 1).padStart(2, '0')}-${String(tpe.getUTCDate()).padStart(2, '0')}`;
    out.push({ date: label, cents: map.get(label) ?? 0 });
  }
  return out;
}

/* ─────────────────────────── Anomaly flag ─────────────────────────── */

/**
 * 簡單 2× threshold anomaly:
 *   today > 2 × prev_7d_avg → red flag
 *
 * 不做真 anomaly detection (Z-score / EWMA / Prophet) — V1.6 是讓 admin 一眼看到
 * 「今日異常高」, 不做 multi-dimensional outlier analysis.
 *
 * 為什麼 prev_7d_avg = 0 → isAnomaly: false:
 *   平台剛上線 / 商家數很少時, 過去 7 天可能 0 用量.
 *   這時 today 任何 > 0 數字都會被判 「∞× avg」誤觸發. 直接 skip.
 *
 * 14 天視窗: 今天 + 過去 7 天 (avg base), 不算入更早避免 trend drift 影響.
 */
export async function flagAnomaly(): Promise<AnomalyFlag> {
  const { totalCents: todayCents } = await getPlatformCostToday(0);
  // limit=0 → 不要 top-N (省 sort), 只要 totalCents
  // (上面 getPlatformCostToday 寫法會回 perTenantTopN: [], totalCents 仍正確)

  // 過去 7 天 (不含今天) — 從 7 天前 TPE 00:00 到今天 TPE 00:00 (= since today)
  const sevenAgo = tpeDaysAgoUtc(7);
  const todayStart = getTpeMidnightUtc();

  const rows = await dbAdmin.execute<{
    tokens_in: string | number;
    tokens_out: string | number;
  }>(sql`
    WITH usage AS (
      SELECT tokens_in, tokens_out FROM import_sessions
      WHERE created_at >= ${sevenAgo} AND created_at < ${todayStart}
      UNION ALL
      SELECT tokens_in, tokens_out FROM ai_usage_events
      WHERE created_at >= ${sevenAgo} AND created_at < ${todayStart}
    )
    SELECT COALESCE(SUM(tokens_in), 0)::bigint AS tokens_in,
           COALESCE(SUM(tokens_out), 0)::bigint AS tokens_out
    FROM usage
  `);

  const r = (rows.rows[0] as { tokens_in: string | number; tokens_out: string | number } | undefined) ?? {
    tokens_in: 0,
    tokens_out: 0,
  };
  const prev7dTotalCents = Math.round(tokenCost(Number(r.tokens_in ?? 0), Number(r.tokens_out ?? 0)));
  const prev7dAvgCents = Math.round(prev7dTotalCents / 7);

  if (prev7dAvgCents === 0) {
    return {
      isAnomaly: false,
      todayCents,
      prev7dAvgCents: 0,
      reason: '基準資料不足',
    };
  }

  if (todayCents > 2 * prev7dAvgCents) {
    return {
      isAnomaly: true,
      todayCents,
      prev7dAvgCents,
      reason: '今日 > 2× 過去 7 天平均',
    };
  }

  return {
    isAnomaly: false,
    todayCents,
    prev7dAvgCents,
  };
}
