/**
 * /admin — 平台 admin overview (V1 #49, RA5)
 * - 4 平台 KPI: 商家總數 / 平台 GMV / 7 天新進駐 / 需關注 (註冊≥7天 + 最後訂單<7天前 OR 從未)
 * - 商家排行表格 (sort dropdown: gmv | productCount | orderCount | createdAt)
 * - 全用 dbAdmin (跨商家視角)
 */
import Link from 'next/link';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products, orders } from '@/db/schema';
import { count, sql, sum } from 'drizzle-orm';
import { Building2, ShoppingCart, Sparkles, AlertCircle, ArrowUpRight } from 'lucide-react';
import { SortDropdown } from './SortDropdown';

export const dynamic = 'force-dynamic';

const SORT_OPTIONS = {
  gmv: 'GMV (高 → 低)',
  productCount: '商品數 (多 → 少)',
  orderCount: '訂單數 (多 → 少)',
  createdAt: '註冊時間 (新 → 舊)',
} as const;

type SortKey = keyof typeof SORT_OPTIONS;

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  const params = await searchParams;
  const sortKey: SortKey =
    params.sort && params.sort in SORT_OPTIONS ? (params.sort as SortKey) : 'gmv';

  // ─── 平台 KPI (4 numbers) ───
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [merchantStats] = await dbAdmin
    .select({
      total: count(merchants.id),
      newSeven: sql<number>`count(*) filter (where ${merchants.createdAt} >= ${sevenDaysAgo} AND ${merchants.suspendedAt} IS NULL)`.mapWith(
        Number,
      ),
    })
    .from(merchants);

  const [orderTotals] = await dbAdmin
    .select({
      gmvCents: sum(orders.totalCents).mapWith(Number),
      total: count(orders.id),
    })
    .from(orders)
    .where(sql`${orders.status} IN ('paid','shipped','completed')`);

  // 「需關注」 = 註冊 ≥ 7 天 AND (從未訂單 OR 最後訂單 < 7 天前)
  const needsAttention = await dbAdmin.execute(sql`
    SELECT count(*)::int AS n FROM ${merchants} m
    WHERE m.created_at < ${sevenDaysAgo}
      AND m.suspended_at IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM ${orders} o
        WHERE o.tenant_id = m.id
          AND o.created_at >= ${sevenDaysAgo}
      )
  `);
  const needsAttentionCount =
    Number((needsAttention.rows[0] as { n: number } | undefined)?.n ?? 0);

  // ─── 商家排行 list ───
  // 跨商家 join: merchants LEFT JOIN orders/products → 取 GMV / orderCount / productCount
  const rankingsRaw = await dbAdmin.execute(sql`
    SELECT
      m.id,
      m.slug,
      m.name,
      m.suspended_at,
      m.created_at,
      COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','completed') THEN o.total_cents ELSE 0 END), 0)::bigint AS gmv_cents,
      COUNT(DISTINCT o.id)::int AS order_count,
      (SELECT COUNT(*)::int FROM ${products} p WHERE p.tenant_id = m.id) AS product_count,
      MAX(o.created_at) AS last_activity
    FROM ${merchants} m
    LEFT JOIN ${orders} o ON o.tenant_id = m.id
    GROUP BY m.id, m.slug, m.name, m.suspended_at, m.created_at
    ORDER BY
      CASE WHEN ${sortKey} = 'gmv' THEN COALESCE(SUM(CASE WHEN o.status IN ('paid','shipped','completed') THEN o.total_cents ELSE 0 END), 0) END DESC NULLS LAST,
      CASE WHEN ${sortKey} = 'productCount' THEN (SELECT COUNT(*) FROM ${products} p WHERE p.tenant_id = m.id) END DESC NULLS LAST,
      CASE WHEN ${sortKey} = 'orderCount' THEN COUNT(DISTINCT o.id) END DESC NULLS LAST,
      CASE WHEN ${sortKey} = 'createdAt' THEN m.created_at END DESC NULLS LAST
  `);

  const rankings = (rankingsRaw.rows as unknown as Array<{
    id: string;
    slug: string;
    name: string;
    suspended_at: Date | null;
    created_at: Date;
    gmv_cents: string | number;
    order_count: number;
    product_count: number;
    last_activity: Date | null;
  }>).map((r) => ({
    ...r,
    gmvCents: Number(r.gmv_cents),
  }));

  return (
    <main className="px-12 py-10">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <header className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              Catalogify · 平台管理
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">商家排行</h1>
            <p className="text-sm text-zinc-500">
              {merchantStats?.total ?? 0} 家商家 · 平台累計 GMV NT$ {((orderTotals?.gmvCents ?? 0) / 100).toLocaleString()}
            </p>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1 text-sm text-zinc-600 underline-offset-4 hover:underline"
          >
            前台首頁
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </Link>
        </header>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiBlock icon={Building2} label="商家總數" value={merchantStats?.total ?? 0} sub={`${merchantStats?.newSeven ?? 0} 家近 7 天新進駐`} />
          <KpiBlock icon={Sparkles} label="7 天新進駐" value={merchantStats?.newSeven ?? 0} sub="suspended_at IS NULL" />
          <KpiBlock icon={ShoppingCart} label="平台訂單" value={orderTotals?.total ?? 0} sub={`累計 GMV NT$ ${((orderTotals?.gmvCents ?? 0) / 100).toLocaleString()}`} />
          <KpiBlock icon={AlertCircle} label="需關注商家" value={needsAttentionCount} sub="註冊≥7天且近7天無訂單" warning={needsAttentionCount > 0} />
        </div>

        {/* Sort dropdown */}
        <SortDropdown current={sortKey} />

        {/* Rankings table */}
        <div className="overflow-hidden rounded border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr className="text-xs uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3 font-medium">slug</th>
                <th className="px-4 py-3 font-medium">名稱</th>
                <th className="px-4 py-3 font-medium">狀態</th>
                <th className="px-4 py-3 font-medium tabular-nums">商品</th>
                <th className="px-4 py-3 font-medium tabular-nums">訂單</th>
                <th className="px-4 py-3 font-medium tabular-nums">GMV</th>
                <th className="px-4 py-3 font-medium">最後活動</th>
              </tr>
            </thead>
            <tbody>
              {rankings.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-zinc-500">
                    平台還沒有商家 — <Link href="/onboarding" className="underline">新增第一家</Link>
                  </td>
                </tr>
              ) : (
                rankings.map((r, i) => (
                  <tr
                    key={r.id}
                    className={`hover:bg-zinc-50 ${i < rankings.length - 1 ? 'border-b border-zinc-100' : ''}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link href={`/admin/merchants/${r.id}`} className="hover:underline">
                        {r.slug}
                      </Link>
                    </td>
                    <td className="px-4 py-3">{r.name}</td>
                    <td className="px-4 py-3">
                      {r.suspended_at ? (
                        <span className="inline-flex rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">
                          已停權
                        </span>
                      ) : (
                        <span className="inline-flex rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                          營運中
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{r.product_count}</td>
                    <td className="px-4 py-3 tabular-nums">{r.order_count}</td>
                    <td className="px-4 py-3 tabular-nums font-medium">
                      NT$ {(r.gmvCents / 100).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500">
                      {r.last_activity ? formatRelative(r.last_activity) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

function KpiBlock({
  icon: Icon,
  label,
  value,
  sub,
  warning = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded border bg-white p-5 ${warning && Number(value) > 0 ? 'border-amber-300 bg-amber-50' : 'border-zinc-200'}`}
    >
      <div className="mb-3 flex items-center gap-2">
        <Icon
          className="h-4 w-4 text-zinc-500"
          strokeWidth={2.2}
        />
        <span className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {label}
        </span>
      </div>
      <p className="text-3xl font-semibold leading-none tabular-nums text-zinc-900">
        {value}
      </p>
      <p className="mt-2 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 60) return `${min} 分前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return new Date(date).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}
