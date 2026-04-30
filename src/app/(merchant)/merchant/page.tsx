/**
 * 商家後台首頁 — Dashboard
 * KPI 概覽 + 近 7 天訂單趨勢 + 商品上架轉換率 + 最近訂單 + 銷量 Top 3
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, orders, orderItems, merchants } from '@/db/schema';
import { count, eq, sum, sql, desc, gte, lte } from 'drizzle-orm';
import { Plus, Package, ShoppingCart, ExternalLink, TrendingUp, Settings } from 'lucide-react';
import { KpiCard } from '@/components/dashboard/KpiCard';
import { PendingCallout } from '@/components/merchant/PendingCallout';
import { HealthCallout } from '@/components/merchant/HealthCallout';
import { getHealthIssues } from '@/lib/merchant/health-checks';
import { dbAdmin } from '@/db/admin-only';

export const dynamic = 'force-dynamic';

export default async function MerchantDashboard() {
  const c = await cookies();
  const merchant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  // KPI 統計
  const [productStats] = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        total: count(products.id),
        published: sql<number>`count(*) filter (where ${products.isPublished} = true)`.mapWith(Number),
      })
      .from(products);
  });

  const [orderStats] = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        total: count(orders.id),
        paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')`.mapWith(Number),
        revenue: sum(orders.totalCents).mapWith(Number),
        avgTicket: sql<number>`coalesce(avg(${orders.totalCents}), 0)`.mapWith(Number),
      })
      .from(orders);
  });

  // 近 7 天每日訂單數 (含 0)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const dailyRows = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        day: sql<string>`to_char(${orders.createdAt}, 'YYYY-MM-DD')`.as('day'),
        count: count(orders.id),
        revenue: sum(orders.totalCents).mapWith(Number),
      })
      .from(orders)
      .where(gte(orders.createdAt, sevenDaysAgo))
      .groupBy(sql`to_char(${orders.createdAt}, 'YYYY-MM-DD')`);
  });

  const dailyMap = new Map(dailyRows.map((r) => [r.day, r]));
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    const key = d.toISOString().slice(0, 10);
    const row = dailyMap.get(key);
    return {
      day: key,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      count: row?.count ?? 0,
      revenue: row?.revenue ?? 0,
    };
  });
  const maxCount = Math.max(...days.map((d) => d.count), 1);

  // 銷量 Top 3
  const topProducts = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        productId: orderItems.productId,
        title: products.title,
        priceCents: products.priceCents,
        soldCount: sql<number>`sum(${orderItems.quantity})`.mapWith(Number),
        revenue: sql<number>`sum(${orderItems.unitPriceCents} * ${orderItems.quantity})`.mapWith(Number),
      })
      .from(orderItems)
      .innerJoin(products, eq(orderItems.productId, products.id))
      .groupBy(orderItems.productId, products.title, products.priceCents)
      .orderBy(desc(sql`sum(${orderItems.quantity})`))
      .limit(3);
  });

  // 最近 5 筆訂單
  const recentOrders = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        id: orders.id,
        customerEmail: orders.customerEmail,
        totalCents: orders.totalCents,
        status: orders.status,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .orderBy(desc(orders.createdAt))
      .limit(5);
  });

  // V1 #72: 待處理 callout query (Promise.all 平行 → 同 withTenantTx)
  const [merchantRow] = await dbAdmin
    .select({ lowStockThreshold: merchants.lowStockThreshold })
    .from(merchants)
    .where(eq(merchants.id, merchant.tenantId))
    .limit(1);
  const lowStockThreshold = merchantRow?.lowStockThreshold ?? 5;

  // V1.5 B1: PendingCallout + HealthCallout 平行抓 (兩個獨立 tenant tx)
  const [calloutBundle, healthIssues] = await Promise.all([
    withTenantTx(merchant.tenantId, async (tx) => {
      const [orderCounts, lowStock] = await Promise.all([
        tx
          .select({
            pending: sql<number>`count(*) filter (where ${orders.status} = 'pending')::int`.mapWith(Number),
            paid: sql<number>`count(*) filter (where ${orders.status} = 'paid')::int`.mapWith(Number),
          })
          .from(orders),
        tx
          .select({ n: count(products.id) })
          .from(products)
          .where(lte(products.stockQuantity, lowStockThreshold)),
      ]);
      return {
        pending: orderCounts[0]?.pending ?? 0,
        paid: orderCounts[0]?.paid ?? 0,
        lowStock: lowStock[0]?.n ?? 0,
      };
    }),
    getHealthIssues(merchant.tenantId),
  ]);
  const callout = calloutBundle;

  // 上架轉換率
  const publishRate = productStats.total > 0
    ? Math.round((productStats.published / productStats.total) * 100)
    : 0;

  // 最近訂單金額累計 (近 7 天)
  const last7Revenue = days.reduce((s, d) => s + d.revenue, 0);
  const last7Orders = days.reduce((s, d) => s + d.count, 0);

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl space-y-10">
        {/* Header */}
        <header className="flex items-end justify-between gap-6">
          <div className="space-y-2">
            <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              商家後台 · {merchant.name}
            </p>
            <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              {greetingByHour()}{merchant.name}
            </h1>
            <p className="t-body opacity-70">
              你的店面在{' '}
              <Link
                href={`/store/${merchant.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 underline"
                style={{ color: 'var(--brand-primary)' }}
              >
                /store/{merchant.slug}
                <ExternalLink className="h-3 w-3" strokeWidth={2.4} />
              </Link>
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/merchant/settings"
              className="hover-lift inline-flex items-center gap-2 px-4 py-3 text-sm"
              style={{
                border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)',
                color: 'var(--brand-primary)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <Settings className="h-4 w-4" strokeWidth={2.2} />
              設定
            </Link>
            <Link
              href="/merchant/products/new"
              className="hover-lift inline-flex items-center gap-2 px-6 py-3 text-base font-semibold elev-2"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
                fontFamily: 'var(--brand-font-heading)',
              }}
            >
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              上架新商品
            </Link>
          </div>
        </header>

        {/* V1 #72 PendingCallout (全 0 不顯示) */}
        <PendingCallout
          pendingOrders={callout.pending}
          paidOrders={callout.paid}
          lowStockCount={callout.lowStock}
          lowStockThreshold={lowStockThreshold}
        />

        {/* V1.5 B1 HealthCallout (issues=[] 不顯示) */}
        <HealthCallout issues={healthIssues} />

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            href="/merchant/products"
            icon={Package}
            label="所有商品"
            value={productStats.total}
            sub={`${productStats.published} 件已上架`}
          />
          <KpiCard
            href="/merchant/products"
            icon={Package}
            label="上架轉換率"
            value={`${publishRate}%`}
            sub={`${productStats.published} / ${productStats.total}`}
          />
          <KpiCard
            href="/merchant/orders"
            icon={ShoppingCart}
            label="訂單"
            value={orderStats.total}
            sub={`近 7 天 +${last7Orders}`}
          />
          <KpiCard
            href="/merchant/orders"
            icon={TrendingUp}
            label="總營收"
            value={`NT$ ${((orderStats.revenue ?? 0) / 100).toLocaleString()}`}
            sub={`近 7 天 NT$ ${(last7Revenue / 100).toLocaleString()}`}
          />
        </div>

        {/* 兩欄: 近 7 天圖 + 銷量 Top 3 */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* 近 7 天訂單 bar chart */}
          <div
            className="lg:col-span-2 border p-6"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
              boxShadow: 'var(--elev-1)',
            }}
          >
            <div className="mb-6 flex items-baseline justify-between">
              <div>
                <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  近 7 天訂單分佈
                </p>
                <p className="t-tabular mt-1 text-2xl font-semibold" style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}>
                  {last7Orders} 筆
                </p>
              </div>
              {orderStats.avgTicket > 0 && (
                <p className="text-xs opacity-60">
                  平均客單價 NT$ {Math.round(orderStats.avgTicket / 100).toLocaleString()}
                </p>
              )}
            </div>

            <div className="flex h-40 items-end gap-2">
              {days.map((d) => {
                const h = d.count === 0 ? 4 : Math.max(8, (d.count / maxCount) * 140);
                return (
                  <div key={d.day} className="flex flex-1 flex-col items-center gap-2">
                    <div className="text-xs tabular-nums" style={{ color: d.count > 0 ? 'var(--brand-primary)' : 'transparent' }}>
                      {d.count}
                    </div>
                    <div
                      className="w-full transition-all"
                      style={{
                        height: `${h}px`,
                        backgroundColor: d.count > 0 ? 'var(--brand-primary)' : 'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                        borderRadius: 'var(--brand-radius)',
                      }}
                    />
                    <div className="text-xs tabular-nums opacity-50">{d.label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 銷量 Top 3 */}
          <div
            className="border p-6"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
              boxShadow: 'var(--elev-1)',
            }}
          >
            <p className="t-caption mb-4" style={{ color: 'var(--brand-primary)' }}>
              熱銷 Top 3
            </p>
            {topProducts.length === 0 ? (
              <p className="t-small opacity-50 py-8 text-center">尚無銷售資料</p>
            ) : (
              <div className="space-y-3">
                {topProducts.map((p, i) => (
                  <Link
                    key={p.productId}
                    href={`/merchant/products/${p.productId}`}
                    className="hover-lift flex items-center gap-3 border p-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                      borderRadius: 'var(--brand-radius)',
                    }}
                  >
                    <span
                      className="t-tabular flex h-8 w-8 shrink-0 items-center justify-center text-lg font-bold"
                      style={{
                        color: 'var(--brand-primary)',
                        fontFamily: 'var(--brand-font-heading)',
                      }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="t-small line-clamp-1 font-medium">{p.title}</p>
                      <p className="t-caption opacity-50 tabular-nums">
                        賣出 {p.soldCount} 件 · NT$ {(p.revenue / 100).toLocaleString()}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 最近訂單 */}
        <div
          className="border p-6"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
            borderRadius: 'var(--brand-radius)',
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
          }}
        >
          <div className="mb-4 flex items-baseline justify-between">
            <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              最近訂單
            </p>
            <Link
              href="/merchant/orders"
              className="t-small underline hover:opacity-80"
              style={{ color: 'var(--brand-primary)' }}
            >
              全部訂單 →
            </Link>
          </div>
          {recentOrders.length === 0 ? (
            <p className="t-small opacity-50 py-8 text-center">
              還沒有訂單。先把商品上架, 顧客才下得了單。
            </p>
          ) : (
            <div className="space-y-2">
              {recentOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center gap-4 text-sm"
                  style={{
                    paddingBottom: '8px',
                    borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 10%, transparent)',
                  }}
                >
                  <span className="font-mono text-xs opacity-60">#{o.id.slice(0, 8)}</span>
                  <span className="flex-1 truncate">{o.customerEmail}</span>
                  <span className="t-tabular font-semibold" style={{ color: 'var(--brand-primary)' }}>
                    NT$ {(o.totalCents / 100).toLocaleString()}
                  </span>
                  <span className="text-xs opacity-50">{o.status === 'paid' ? '已付款' : o.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function greetingByHour(): string {
  const h = new Date().getHours();
  if (h < 5) return '夜深了, ';
  if (h < 11) return '早安, ';
  if (h < 14) return '中午好, ';
  if (h < 18) return '午安, ';
  return '晚安, ';
}
