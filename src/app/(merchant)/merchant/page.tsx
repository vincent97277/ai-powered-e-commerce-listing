/**
 * 商家後台首頁 — 簡化版 dashboard
 * 列出 KPI 概覽 + 快捷入口
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { products, orders } from '@/db/schema';
import { count, eq, sum, sql } from 'drizzle-orm';
import { Plus, Package, ShoppingCart, ExternalLink, TrendingUp } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function MerchantDashboard() {
  const c = await cookies();
  const merchant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  const [stats] = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        totalProducts: count(products.id),
        publishedProducts: sql<number>`count(*) filter (where ${products.isPublished} = true)`.mapWith(Number),
      })
      .from(products);
  });

  const [orderStats] = await withTenantTx(merchant.tenantId, async (tx) => {
    return await tx
      .select({
        totalOrders: count(orders.id),
        paidOrders: sql<number>`count(*) filter (where ${orders.status} = 'paid')`.mapWith(Number),
        totalRevenue: sum(orders.totalCents).mapWith(Number),
      })
      .from(orders);
  });

  const KPIS = [
    {
      label: '所有商品',
      value: stats.totalProducts,
      icon: Package,
      sub: `${stats.publishedProducts} 件已上架`,
      href: '/merchant/products',
    },
    {
      label: '訂單',
      value: orderStats.totalOrders,
      icon: ShoppingCart,
      sub: `${orderStats.paidOrders} 件已付款`,
      href: '/merchant/products',
    },
    {
      label: '總營收',
      value: `NT$ ${((orderStats.totalRevenue ?? 0) / 100).toLocaleString()}`,
      icon: TrendingUp,
      sub: '累計',
      href: '/merchant/products',
    },
  ];

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl space-y-10">
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
        </header>

        {/* KPI cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {KPIS.map(({ label, value, icon: Icon, sub, href }) => (
            <Link
              key={label}
              href={href}
              className="hover-lift block border p-6"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                borderRadius: 'var(--brand-radius)',
                backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
                boxShadow: 'var(--elev-1)',
              }}
            >
              <div className="mb-3 flex items-center gap-2">
                <Icon
                  className="h-4 w-4"
                  strokeWidth={2.2}
                  style={{ color: 'var(--brand-primary)' }}
                />
                <span className="t-caption" style={{ color: 'var(--brand-primary)' }}>
                  {label}
                </span>
              </div>
              <p
                className="t-tabular text-4xl font-semibold leading-none"
                style={{ color: 'var(--brand-text)', fontFamily: 'var(--brand-font-heading)' }}
              >
                {value}
              </p>
              <p
                className="t-small mt-2"
                style={{ color: 'color-mix(in srgb, var(--brand-text) 55%, transparent)' }}
              >
                {sub}
              </p>
            </Link>
          ))}
        </div>

        {/* 快捷區 */}
        <div
          className="grid gap-4 border p-6 sm:grid-cols-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
            borderRadius: 'var(--brand-radius)',
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
          }}
        >
          <Link href="/merchant/products" className="hover-lift block">
            <p className="t-caption mb-1" style={{ color: 'var(--brand-primary)' }}>
              商品管理
            </p>
            <p className="t-body font-medium">看清單、改、刪 →</p>
          </Link>
          <Link href={`/store/${merchant.slug}`} target="_blank" className="hover-lift block">
            <p className="t-caption mb-1" style={{ color: 'var(--brand-primary)' }}>
              預覽店面
            </p>
            <p className="t-body font-medium">顧客視角看你的店 →</p>
          </Link>
          <Link href="/merchant/products/new" className="hover-lift block">
            <p className="t-caption mb-1" style={{ color: 'var(--brand-primary)' }}>
              新商品
            </p>
            <p className="t-body font-medium">拍照丟給 AI →</p>
          </Link>
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
