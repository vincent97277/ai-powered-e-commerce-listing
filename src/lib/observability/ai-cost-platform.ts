/**
 * Platform-wide AI cost aggregation (V1.6 Track A9)
 *
 * Difference vs ai-cost.ts:
 *   - ai-cost.ts:  per-tenant daily cap guard (check before every AI call)
 *   - this file:   cross-tenant dashboard query (admin views platform-wide usage)
 *
 * Why dbAdmin:
 *   - Cross-tenant view, no single tenant_id to bind
 *   - src/lib/observability/** is already in eslint.config.mjs allowlist
 *   - Read-only, no writes (returns aggregated numbers, doesn't leak per-row data)
 *
 * Why query both tables like ai-cost.ts (UNION ALL):
 *   - import_sessions:  written by IG/Shopee batch import worker
 *   - ai_usage_events:  written by sync photo upload (/api/products/generate)
 *   - The two sources don't overlap (sync doesn't write import_sessions, batch doesn't write ai_usage_events)
 *   - Skipping either undercounts, so dashboard numbers != actual billing
 *
 * Pricing shared via ai-cost-pricing.ts (see that file's docstring) — single source of truth.
 *
 * Timezone: TPE boundary reuses __test.getTpeMidnightUtc to avoid two places computing
 * boundary independently and drifting.
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
  /** Chinese description, UI consumes directly (e.g. "today > 2x past 7-day average") */
  reason?: string;
};

/* ─────────────────────────── Helpers ─────────────────────────── */

/**
 * UTC date corresponding to TPE today 00:00 minus n days
 *
 * Use getTpeMidnightUtc to get today's TPE boundary, then subtract n*24h. Since TPE has no DST,
 * a 24h step never crosses a DST boundary, so "go back n days" = subtract n × 86400s is safe.
 */
function tpeDaysAgoUtc(daysAgo: number): Date {
  const today = getTpeMidnightUtc();
  return new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
}

/* ─────────────────────────── Today's cost (platform-wide + top-N tenants) ─────────────────────────── */

/**
 * Today's (TPE) platform-wide AI usage + Top-N tenant breakdown
 *
 * Each source GROUPs BY tenant_id, then UNION sums, then JOINs merchants for slug/name.
 * Top-N: sorted by cents, take top N (default 10).
 */
export async function getPlatformCostToday(limit = 10): Promise<PlatformCostToday> {
  const since = getTpeMidnightUtc();

  // Why SUM(tokens_in) / SUM(tokens_out) is computed in SQL, then tokenCost() is applied in JS:
  //   tokenCost is float math (USD → TWD × 100 cents), doable in SQL via numeric but
  //   keeping the pricing formula centralized in one place (ai-cost-pricing.ts) is easier to maintain
  //
  // Why raw sql instead of drizzle query builder:
  //   GROUP BY + JOIN merchants + UNION ALL combined query reads more naturally as a sql`` template,
  //   and matches the same pattern as admin/page.tsx's ranking query
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

  // total = sum across all tenants (including those not in top-N)
  const totalCents = perTenant.reduce((s, t) => s + t.cents, 0);

  // top-N (cents desc, tie-break by name asc to keep ordering stable)
  const perTenantTopN = [...perTenant]
    .sort((a, b) => (b.cents - a.cents) || a.name.localeCompare(b.name))
    .slice(0, limit);

  return { totalCents, perTenantTopN };
}

/* ─────────────────────────── 14-day timeseries ─────────────────────────── */

/**
 * Past 14 days of per-day (TPE local date) platform-wide AI usage
 *
 * Returns 14 points (zero-usage days are filled in), from 13 days ago → today, ascending order.
 * UI directly .maps to draw a bar chart.
 *
 * GROUP BY date_trunc('day', created_at AT TIME ZONE 'Asia/Taipei') —
 * Postgres's AT TIME ZONE converts timestamptz to TPE local time before truncating to day,
 * matching the "TPE day starts at 00:00" boundary.
 */
export async function getCostTimeseries14d(): Promise<CostTimeseriesPoint[]> {
  // TPE 00:00 from 14 days ago (= start of the "full day" 13 days ago + today = 14 days total)
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

  // Fill 0 (days with no events) — walk 14 TPE local dates
  const out: CostTimeseriesPoint[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = tpeDaysAgoUtc(i);
    // Convert d (UTC midnight TPE) back to TPE local YYYY-MM-DD label
    const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const label = `${tpe.getUTCFullYear()}-${String(tpe.getUTCMonth() + 1).padStart(2, '0')}-${String(tpe.getUTCDate()).padStart(2, '0')}`;
    out.push({ date: label, cents: map.get(label) ?? 0 });
  }
  return out;
}

/* ─────────────────────────── Anomaly flag ─────────────────────────── */

/**
 * Simple 2× threshold anomaly:
 *   today > 2 × prev_7d_avg → red flag
 *
 * No real anomaly detection (Z-score / EWMA / Prophet) — V1.6 just lets admin see
 * "today is unusually high" at a glance, no multi-dimensional outlier analysis.
 *
 * Why prev_7d_avg = 0 → isAnomaly: false:
 *   When the platform just launched / merchant count is small, past 7 days may have 0 usage.
 *   Any today > 0 would then be judged as "∞× avg" and falsely trigger. Skip directly.
 *
 * 14-day window: today + past 7 days (avg base), nothing earlier to avoid trend drift influence.
 */
export async function flagAnomaly(): Promise<AnomalyFlag> {
  const { totalCents: todayCents } = await getPlatformCostToday(0);
  // limit=0 → skip top-N (saves sort), only need totalCents
  // (getPlatformCostToday above returns perTenantTopN: [] but totalCents is still correct)

  // Past 7 days (excluding today) — from 7 days ago TPE 00:00 to today TPE 00:00 (= since today)
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
