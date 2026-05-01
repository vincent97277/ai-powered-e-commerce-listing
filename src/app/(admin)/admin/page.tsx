/**
 * /admin — 平台 admin overview (V1 #49, RA5 / V1.6 A1)
 * - 4 平台 KPI: 商家總數 / 平台 GMV / 7 天新進駐 / 需關注
 * - 商家排行 (URL-synced search + filter + pagination + sort, 全在 AdminToolbar)
 * - 全用 dbAdmin (跨商家視角)
 *
 * V1.6 A1 變更:
 *   - SortDropdown 砍掉, 改用 AdminToolbar (search + status + attn + sort)
 *   - WHERE clause 動態 (q ILIKE / status / attn EXISTS)
 *   - LIMIT/OFFSET pagination (20 per page)
 *   - 過濾後 0 筆 → EmptyState; query throw → ErrorState
 *   - page 越界 → redirect 回 last page (或 /admin if total=0)
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { dbAdmin } from '@/db/admin-only';
import { merchants, products, orders } from '@/db/schema';
import { count, sql, sum } from 'drizzle-orm';
import {
  Building2,
  ShoppingCart,
  Sparkles,
  AlertCircle,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  SearchX,
} from 'lucide-react';
import { AdminToolbar, type AdminSortKey, type AdminStatusFilter } from './AdminToolbar';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ErrorState } from '@/components/feedback/ErrorState';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 20;

const SORT_KEYS = ['gmv', 'orders', 'products', 'created'] as const;
const STATUS_KEYS = ['all', 'active', 'suspended'] as const;

type SearchParams = {
  q?: string;
  status?: string;
  attn?: string;
  sort?: string;
  page?: string;
};

type RankingRow = {
  id: string;
  slug: string;
  name: string;
  suspended_at: Date | null;
  created_at: Date;
  gmv_cents: string | number;
  order_count: number;
  product_count: number;
  last_activity: Date | null;
};

export default async function AdminOverviewPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;

  const q = (params.q ?? '').trim();
  const statusKey: AdminStatusFilter = (STATUS_KEYS as readonly string[]).includes(
    params.status ?? '',
  )
    ? (params.status as AdminStatusFilter)
    : 'all';
  const attn = params.attn === '1';
  const sortKey: AdminSortKey = (SORT_KEYS as readonly string[]).includes(params.sort ?? '')
    ? (params.sort as AdminSortKey)
    : 'gmv';
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1);

  // ─── 平台 KPI (4 numbers) — KPI 不受 filter 影響, 永遠看全平台 ───
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

  // ─── 商家排行 — 動態 WHERE ───
  // 用 sql`` template 安全注入 (drizzle escape)
  const whereClauses = [sql`1=1`];

  if (q.length > 0) {
    // 安全: drizzle sql`` 會把 ${q} 當 parameter 綁, ILIKE pattern 用 || concat
    whereClauses.push(sql`(m.name ILIKE ${'%' + q + '%'} OR m.slug ILIKE ${'%' + q + '%'})`);
  }
  if (statusKey === 'active') {
    whereClauses.push(sql`m.suspended_at IS NULL`);
  } else if (statusKey === 'suspended') {
    whereClauses.push(sql`m.suspended_at IS NOT NULL`);
  }
  if (attn) {
    // needs-attention = 該商家有任何 health issue (no_photo / short_title / zero_stock / zero_price)
    // 跟 health-checks.ts 對齊 (V1.5 B1)
    whereClauses.push(sql`EXISTS (
      SELECT 1 FROM ${products} p
      WHERE p.tenant_id = m.id
        AND (
          p.r2_key IS NULL
          OR p.r2_key = ''
          OR p.r2_key LIKE '%/fixtures/%'
          OR length(p.title) < 8
          OR p.stock_quantity = 0
          OR p.price_cents = 0
        )
    )`);
  }

  // Combine WHERE clauses
  const whereSql = sql.join(whereClauses, sql` AND `);

  // Filtered count first — 拿來決定 totalPages
  let filteredTotal = 0;
  let queryError: Error | null = null;
  let rankings: Array<RankingRow & { gmvCents: number }> = [];

  try {
    const countRes = await dbAdmin.execute(sql`
      SELECT count(*)::int AS n FROM ${merchants} m
      WHERE ${whereSql}
    `);
    filteredTotal = Number((countRes.rows[0] as { n: number } | undefined)?.n ?? 0);

    const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));

    // 越界 redirect (server-side, 用 last page)
    if (filteredTotal > 0 && requestedPage > totalPages) {
      const sp = new URLSearchParams();
      if (q) sp.set('q', q);
      if (statusKey !== 'all') sp.set('status', statusKey);
      if (attn) sp.set('attn', '1');
      if (sortKey !== 'gmv') sp.set('sort', sortKey);
      sp.set('page', String(totalPages));
      redirect(`/admin?${sp.toString()}`);
    }

    const offset = (requestedPage - 1) * PAGE_SIZE;

    // ORDER BY by sortKey — sql.raw 不能用 (注入), 用 if/else 切 SQL fragment
    const orderBySql =
      sortKey === 'orders'
        ? sql`order_count DESC NULLS LAST, m.created_at DESC`
        : sortKey === 'products'
          ? sql`product_count DESC NULLS LAST, m.created_at DESC`
          : sortKey === 'created'
            ? sql`m.created_at DESC`
            : sql`gmv_cents DESC NULLS LAST, m.created_at DESC`;

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
      WHERE ${whereSql}
      GROUP BY m.id, m.slug, m.name, m.suspended_at, m.created_at
      ORDER BY ${orderBySql}
      LIMIT ${PAGE_SIZE} OFFSET ${offset}
    `);

    rankings = (rankingsRaw.rows as unknown as RankingRow[]).map((r) => ({
      ...r,
      gmvCents: Number(r.gmv_cents),
    }));
  } catch (err) {
    // redirect() throws an internal Next.js NEXT_REDIRECT error — 不能當真 error
    if (
      err instanceof Error &&
      'digest' in err &&
      typeof (err as { digest?: string }).digest === 'string' &&
      (err as { digest: string }).digest.startsWith('NEXT_REDIRECT')
    ) {
      throw err;
    }
    queryError = err instanceof Error ? err : new Error(String(err));
  }

  const totalPages = Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE));
  const hasFilters = q.length > 0 || statusKey !== 'all' || attn;

  return (
    <main className="px-4 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              Catalogify · 平台管理
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">商家排行</h1>
            <p className="text-sm text-zinc-500">
              {merchantStats?.total ?? 0} 家商家 · 平台累計 GMV NT$ {((orderTotals?.gmvCents ?? 0) / 100).toLocaleString()}
            </p>
          </div>
          <nav className="flex items-center gap-3 text-sm" aria-label="平台管理導覽">
            <Link
              href="/admin/queue"
              className="text-zinc-600 underline-offset-4 hover:underline"
            >
              客服佇列
            </Link>
            <span className="text-zinc-300" aria-hidden="true">·</span>
            <Link
              href="/admin/cost"
              className="text-zinc-600 underline-offset-4 hover:underline"
            >
              AI 成本
            </Link>
            <span className="text-zinc-300" aria-hidden="true">·</span>
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-zinc-600 underline-offset-4 hover:underline"
            >
              前台首頁
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
            </Link>
          </nav>
        </header>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiBlock icon={Building2} label="商家總數" value={merchantStats?.total ?? 0} sub={`${merchantStats?.newSeven ?? 0} 家近 7 天新進駐`} />
          <KpiBlock icon={Sparkles} label="7 天新進駐" value={merchantStats?.newSeven ?? 0} sub="suspended_at IS NULL" />
          <KpiBlock icon={ShoppingCart} label="平台訂單" value={orderTotals?.total ?? 0} sub={`累計 GMV NT$ ${((orderTotals?.gmvCents ?? 0) / 100).toLocaleString()}`} />
          <KpiBlock icon={AlertCircle} label="需關注商家" value={needsAttentionCount} sub="註冊≥7天且近7天無訂單" warning={needsAttentionCount > 0} />
        </div>

        {/* AdminToolbar — search + filter + sort + needs-attention chip */}
        <AdminToolbar q={q} status={statusKey} attn={attn} sort={sortKey} />

        {/* Rankings table / Empty / Error */}
        {queryError ? (
          <div className="rounded border border-zinc-200 bg-white">
            <ErrorState error={queryError} retryHref="/admin" scope="table" />
          </div>
        ) : rankings.length === 0 ? (
          <div className="rounded border border-zinc-200 bg-white">
            {hasFilters ? (
              <EmptyState
                icon={SearchX}
                title="找不到符合的商家"
                body={buildFilterRecap({ q, statusKey, attn })}
                primaryCTA={{ label: '清除篩選', href: '/admin' }}
                scope="table"
              />
            ) : (
              <EmptyState
                icon={Building2}
                title="平台還沒有商家"
                body="尚未有任何商家進駐."
                primaryCTA={{ label: '新增第一家', href: '/onboarding' }}
                scope="table"
              />
            )}
          </div>
        ) : (
          <>
            <div className="overflow-hidden rounded border border-zinc-200 bg-white">
              <div className="overflow-x-auto">
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
                    {rankings.map((r, i) => (
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pagination footer */}
            <Pagination
              currentPage={requestedPage}
              totalPages={totalPages}
              total={filteredTotal}
              params={params}
            />
          </>
        )}
      </div>
    </main>
  );
}

function buildFilterRecap({
  q,
  statusKey,
  attn,
}: {
  q: string;
  statusKey: AdminStatusFilter;
  attn: boolean;
}): string {
  const parts: string[] = [];
  if (q) parts.push(`搜尋「${q}」`);
  if (statusKey === 'active') parts.push('狀態: 營運中');
  if (statusKey === 'suspended') parts.push('狀態: 已停權');
  if (attn) parts.push('僅顯示需關注');
  return parts.length > 0 ? `目前篩選: ${parts.join(' · ')}` : '';
}

function buildPageHref(page: number, params: SearchParams): string {
  const sp = new URLSearchParams();
  if (params.q) sp.set('q', params.q);
  if (params.status && params.status !== 'all') sp.set('status', params.status);
  if (params.attn === '1') sp.set('attn', '1');
  if (params.sort && params.sort !== 'gmv') sp.set('sort', params.sort);
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `/admin?${qs}` : '/admin';
}

function Pagination({
  currentPage,
  totalPages,
  total,
  params,
}: {
  currentPage: number;
  totalPages: number;
  total: number;
  params: SearchParams;
}) {
  if (totalPages <= 1) {
    return (
      <p className="text-center text-xs text-zinc-500">
        共 {total} 家商家
      </p>
    );
  }

  const prevDisabled = currentPage <= 1;
  const nextDisabled = currentPage >= totalPages;

  return (
    <nav
      className="flex flex-col items-center justify-between gap-3 text-sm sm:flex-row"
      aria-label="商家列表分頁"
    >
      <p className="text-xs text-zinc-500">
        共 {total} 家 · 第 {currentPage} / {totalPages} 頁
      </p>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-400"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            上一頁
          </span>
        ) : (
          <Link
            href={buildPageHref(currentPage - 1, params)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
            rel="prev"
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2.2} />
            上一頁
          </Link>
        )}
        <span className="font-mono text-xs text-zinc-500">
          {currentPage} / {totalPages}
        </span>
        {nextDisabled ? (
          <span
            aria-disabled="true"
            className="inline-flex cursor-not-allowed items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-zinc-400"
          >
            下一頁
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </span>
        ) : (
          <Link
            href={buildPageHref(currentPage + 1, params)}
            className="inline-flex items-center gap-1 rounded border border-zinc-300 bg-white px-3 py-1.5 text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50"
            rel="next"
          >
            下一頁
            <ChevronRight className="h-4 w-4" strokeWidth={2.2} />
          </Link>
        )}
      </div>
    </nav>
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
        <Icon className="h-4 w-4 text-zinc-500" strokeWidth={2.2} />
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
