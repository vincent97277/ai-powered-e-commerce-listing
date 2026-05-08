/**
 * /admin/cost — platform AI cost dashboard (V1.6 Track A9)
 *
 * Three-section layout:
 *   1. Anomaly chip (top)         — today's platform-wide NT$X, amber/red on anomaly
 *   2. 14-day bar chart (middle)  — CSS-only, one bar per day
 *   3. Top-10 tenant table (bottom) — today's usage ranking
 *
 * No per-merchant drill (clicking a slug jumps to /admin/merchants/[id])
 * No CSV export / forecasting / date picker — V2 work
 *
 * Each query is independently try/catch — a single failure only renders that section's ErrorState;
 * other sections remain visible.
 * Why three query imports instead of one bundle: section-level error boundary is cleaner.
 */
import Link from 'next/link';
import { ArrowUpRight, AlertTriangle, AlertCircle, CheckCircle2, Activity } from 'lucide-react';
import {
  getPlatformCostToday,
  getCostTimeseries14d,
  flagAnomaly,
  type PlatformCostToday,
  type CostTimeseriesPoint,
  type AnomalyFlag,
} from '@/lib/observability/ai-cost-platform';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';

export const dynamic = 'force-dynamic';

export default async function AdminCostPage() {
  // Three queries in parallel — any throw only degrades that one section
  const [todayRes, seriesRes, anomalyRes] = await Promise.allSettled([
    getPlatformCostToday(10),
    getCostTimeseries14d(),
    flagAnomaly(),
  ]);

  const todayCost: PlatformCostToday | null = todayRes.status === 'fulfilled' ? todayRes.value : null;
  const todayErr = todayRes.status === 'rejected' ? toError(todayRes.reason) : null;
  const series: CostTimeseriesPoint[] | null = seriesRes.status === 'fulfilled' ? seriesRes.value : null;
  const seriesErr = seriesRes.status === 'rejected' ? toError(seriesRes.reason) : null;
  const anomaly: AnomalyFlag | null = anomalyRes.status === 'fulfilled' ? anomalyRes.value : null;
  const anomalyErr = anomalyRes.status === 'rejected' ? toError(anomalyRes.reason) : null;

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-8">
        {/* Header — sibling nav aligned with /admin overview */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-ink-muted">
              Catalogify · 平台管理
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">AI 成本儀表板</h1>
            <p className="text-sm text-ink-muted">
              全平台今日 AI token 用量 · 過去 14 天趨勢 · Top 10 商家排行
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm" aria-label="平台管理導覽">
            <Link
              href="/admin"
              className="text-ink-muted underline-offset-4 hover:underline"
            >
              商家排行
            </Link>
            <span className="text-ink-faint" aria-hidden="true">·</span>
            <Link
              href="/admin/queue"
              className="text-ink-muted underline-offset-4 hover:underline"
            >
              客服佇列
            </Link>
            <span className="text-ink-faint" aria-hidden="true">·</span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-ink-muted underline-offset-4 hover:underline"
            >
              前台首頁
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </Link>
          </nav>
        </header>

        {/* Section 1: Anomaly chip */}
        <section aria-labelledby="cost-summary-h">
          <h2 id="cost-summary-h" className="sr-only">
            今日全平台 AI 成本摘要
          </h2>
          {anomalyErr ? (
            <div className="rounded border surface-card border-card-soft">
              <ErrorState error={anomalyErr} retryHref="/admin/cost" scope="section" />
            </div>
          ) : anomaly ? (
            <PlatformCostChip anomaly={anomaly} />
          ) : null}
        </section>

        {/* Section 2: 14-day bar chart */}
        <section
          aria-labelledby="cost-chart-h"
          className="border p-4 sm:p-6"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
            borderRadius: 'var(--brand-radius)',
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
            boxShadow: 'var(--elev-1)',
          }}
        >
          <div className="mb-6 flex items-baseline justify-between">
            <div>
              <p className="t-caption" id="cost-chart-h" style={{ color: 'var(--brand-primary)' }}>
                過去 14 天 AI 用量趨勢
              </p>
              {series && (
                <p
                  className="t-tabular mt-1 text-2xl font-semibold"
                  style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}
                >
                  NT$ {(series.reduce((s, p) => s + p.cents, 0) / 100).toLocaleString()}
                </p>
              )}
            </div>
            <p className="text-xs opacity-60">每日 (TPE) 全平台合計</p>
          </div>

          {seriesErr ? (
            <ErrorState error={seriesErr} retryHref="/admin/cost" scope="section" />
          ) : !series ? null : series.every((p) => p.cents === 0) ? (
            <EmptyState
              icon={Activity}
              title="過去 14 天尚無 AI 用量"
              body="還沒有任何商家觸發 AI 呼叫. 等他們開始上架就會有資料."
              scope="section"
            />
          ) : (
            <CostBarChart14d series={series} />
          )}
        </section>

        {/* Section 3: Top-10 tenant table */}
        <section
          aria-labelledby="cost-top-h"
          className="overflow-hidden rounded border surface-card border-card-soft"
        >
          <div
            className="px-4 py-3 sm:px-6"
            style={{ borderBottom: '1px solid var(--border-hairline)' }}
          >
            <p id="cost-top-h" className="text-xs font-medium uppercase tracking-wider text-ink-muted">
              今日 Top 10 商家
            </p>
            {todayCost && (
              <p className="mt-1 text-sm text-ink-muted">
                全平台今日合計 NT$ {(todayCost.totalCents / 100).toLocaleString()}
              </p>
            )}
          </div>

          {todayErr ? (
            <ErrorState error={todayErr} retryHref="/admin/cost" scope="table" />
          ) : !todayCost ? null : todayCost.totalCents === 0 || todayCost.perTenantTopN.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="今日尚無 AI 用量"
              body="今日 (TPE 00:00 起) 所有商家都還沒觸發 AI 呼叫."
              scope="table"
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="surface-card-tinted text-left">
                  <tr className="text-xs uppercase tracking-wider text-ink-muted">
                    <th className="px-4 py-3 font-medium">#</th>
                    <th className="px-4 py-3 font-medium">slug</th>
                    <th className="px-4 py-3 font-medium">名稱</th>
                    <th className="px-4 py-3 font-medium tabular-nums">今日用量</th>
                  </tr>
                </thead>
                <tbody>
                  {todayCost.perTenantTopN.map((t, i) => (
                    <tr
                      key={t.tenantId}
                      className="transition-colors hover:bg-brand-soft"
                      style={{
                        borderBottom:
                          i < todayCost.perTenantTopN.length - 1
                            ? '1px solid var(--border-hairline)'
                            : undefined,
                      }}
                    >
                      <td className="px-4 py-3 tabular-nums text-ink-muted">{i + 1}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        <Link
                          href={`/admin/merchants/${t.tenantId}`}
                          className="hover:underline"
                        >
                          {t.slug}
                        </Link>
                      </td>
                      <td className="px-4 py-3">{t.name}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        NT$ {(t.cents / 100).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* ─────────────────────────── PlatformCostChip ─────────────────────────── */

/**
 * Platform-level DailyCostChip — same visual vocabulary as merchant settings DailyCostChip,
 * but with different color logic:
 *   - no anomaly: green (success), shows "Today's platform AI usage: NT$X"
 *   - >2× avg (mild): yellow (warning), shows the ratio
 *   - >5× avg (severe): red (error), shows the ratio
 *
 * "Insufficient baseline" (prev7dAvgCents=0): neutral gray, no warning
 */
function PlatformCostChip({ anomaly }: { anomaly: AnomalyFlag }) {
  const todayTwd = Math.round(anomaly.todayCents / 100);
  const avgTwd = Math.round(anomaly.prev7dAvgCents / 100);

  // Severity determination (independent of the isAnomaly flag — UI layer decides 5× severe)
  const ratio = anomaly.prev7dAvgCents > 0 ? anomaly.todayCents / anomaly.prev7dAvgCents : 0;
  const severe = anomaly.isAnomaly && ratio >= 5;
  const mild = anomaly.isAnomaly && !severe;
  const noBaseline = anomaly.prev7dAvgCents === 0;

  const tone = severe ? 'error' : mild ? 'warning' : noBaseline ? 'neutral' : 'success';

  const colorVar =
    tone === 'error'
      ? 'var(--error)'
      : tone === 'warning'
        ? 'var(--warning)'
        : tone === 'success'
          ? 'var(--success, #16a34a)'
          : 'color-mix(in srgb, var(--brand-text) 50%, transparent)';

  const Icon =
    tone === 'error' ? AlertCircle : tone === 'warning' ? AlertTriangle : tone === 'success' ? CheckCircle2 : Activity;

  // Label:
  //   - anomaly: "Anomaly: NT$X is 3.2× the average NT$Y"
  //   - normal: "Today's platform AI usage: NT$X (baseline NT$Y/day)"
  //   - insufficient baseline: "Today's platform AI usage: NT$X (baseline data insufficient)"
  let label: string;
  if (anomaly.isAnomaly) {
    label = `異常: NT$${todayTwd.toLocaleString()} 為平均 NT$${avgTwd.toLocaleString()} 的 ${ratio.toFixed(1)} 倍`;
  } else if (noBaseline) {
    label = `今日全平台 AI 用量: NT$${todayTwd.toLocaleString()} · 基準資料不足`;
  } else {
    label = `今日全平台 AI 用量: NT$${todayTwd.toLocaleString()} · 過去 7 天平均 NT$${avgTwd.toLocaleString()}/天`;
  }

  return (
    <div
      className="inline-flex max-w-full items-start gap-2 rounded px-3 py-2 text-sm font-medium tabular-nums sm:items-center"
      style={{
        backgroundColor: `color-mix(in srgb, ${colorVar} 8%, transparent)`,
        border: `1px solid color-mix(in srgb, ${colorVar} 30%, transparent)`,
        color: colorVar,
        borderRadius: 'var(--brand-radius)',
      }}
      role={anomaly.isAnomaly ? 'alert' : 'status'}
      aria-label={label}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/* ─────────────────────────── CostBarChart14d ─────────────────────────── */

/**
 * 14-day CSS bar chart — copies /merchant/page.tsx:276-297 pattern, extended to 14 days.
 *
 * Why not Recharts/D3:
 *   - one bar chart isn't worth a 50KB JS bundle
 *   - server component, 100% SSR friendly
 *   - visually consistent with the merchant-side 7-day chart
 */
function CostBarChart14d({ series }: { series: CostTimeseriesPoint[] }) {
  const maxCents = Math.max(...series.map((p) => p.cents), 1);

  return (
    <div className="flex h-40 items-end gap-1 sm:gap-1.5">
      {series.map((p) => {
        const h = p.cents === 0 ? 4 : Math.max(8, (p.cents / maxCents) * 140);
        // YYYY-MM-DD → M/D
        const [, mm, dd] = p.date.split('-');
        const label = `${Number(mm)}/${Number(dd)}`;
        const tw = Math.round(p.cents / 100);

        return (
          <div key={p.date} className="flex flex-1 flex-col items-center gap-2">
            <div
              className="hidden text-[10px] tabular-nums sm:block"
              style={{ color: p.cents > 0 ? 'var(--brand-primary)' : 'transparent' }}
              aria-hidden="true"
            >
              {tw}
            </div>
            <div
              className="w-full transition-all"
              style={{
                height: `${h}px`,
                backgroundColor:
                  p.cents > 0
                    ? 'var(--brand-primary)'
                    : 'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
              role="img"
              aria-label={`${p.date}: NT$${tw.toLocaleString()}`}
            />
            <div className="text-[10px] tabular-nums opacity-50 sm:text-xs">{label}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── helpers ─────────────────────────── */

function toError(reason: unknown): Error {
  if (reason instanceof Error) return reason;
  return new Error(typeof reason === 'string' ? reason : '查詢失敗');
}
