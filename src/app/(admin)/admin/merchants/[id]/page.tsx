/**
 * /admin/merchants/[id] — platform admin view of a single merchant detail (V1 #50)
 * - Header: merchant name + slug + status badge + 3 actions (suspend / rename slug)
 * - 4 KPIs: products / orders / GMV / signup date
 * - Tabs: products (top 20) / orders (top 20) — V1 pure SSR, no client tabs (switch via URL ?tab=)
 * - admin_action_history timeline (right column)
 *
 * Uses dbAdmin throughout (cross-merchant view)
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dbAdmin } from '@/db/admin-only';
import {
  merchants,
  products,
  orders,
  adminActionHistory,
} from '@/db/schema';
import { count, desc, eq, sql, sum } from 'drizzle-orm';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { MerchantActions } from './MerchantActions';

export const dynamic = 'force-dynamic';

export default async function AdminMerchantDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === 'orders' ? 'orders' : 'products';

  const [merchant] = await dbAdmin.select().from(merchants).where(eq(merchants.id, id)).limit(1);
  if (!merchant) notFound();

  // KPI
  const [pStat] = await dbAdmin
    .select({ total: count(products.id) })
    .from(products)
    .where(eq(products.tenantId, id));
  const [oStat] = await dbAdmin
    .select({
      total: count(orders.id),
      gmv: sum(orders.totalCents).mapWith(Number),
    })
    .from(orders)
    .where(sql`${orders.tenantId} = ${id} AND ${orders.status} IN ('paid','shipped','completed')`);

  // Top 20 products
  const productList =
    tab === 'products'
      ? await dbAdmin
          .select({
            id: products.id,
            title: products.title,
            priceCents: products.priceCents,
            stockQuantity: products.stockQuantity,
            isPublished: products.isPublished,
            createdAt: products.createdAt,
          })
          .from(products)
          .where(eq(products.tenantId, id))
          .orderBy(desc(products.createdAt))
          .limit(20)
      : [];

  // Top 20 orders
  const orderList =
    tab === 'orders'
      ? await dbAdmin
          .select({
            id: orders.id,
            customerEmail: orders.customerEmail,
            totalCents: orders.totalCents,
            status: orders.status,
            createdAt: orders.createdAt,
          })
          .from(orders)
          .where(eq(orders.tenantId, id))
          .orderBy(desc(orders.createdAt))
          .limit(20)
      : [];

  // Admin action history (right column)
  const actionLog = await dbAdmin
    .select()
    .from(adminActionHistory)
    .where(eq(adminActionHistory.targetMerchantId, id))
    .orderBy(desc(adminActionHistory.createdAt))
    .limit(20);

  return (
    <main className="px-12 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <Link
          href="/admin"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
          回列表
        </Link>

        {/* Header */}
        <header className="flex items-start justify-between gap-6">
          <div className="space-y-2">
            <p className="font-mono text-xs uppercase tracking-wider text-zinc-500">
              {merchant.slug}
            </p>
            <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
              {merchant.name}
              {merchant.approvedAt == null && (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                  待審核
                </span>
              )}
              {merchant.suspendedAt && (
                <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
                  已停權
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-500">
              註冊於 {merchant.createdAt.toLocaleDateString('zh-TW')} · {' '}
              <Link
                href={`/store/${merchant.slug}`}
                target="_blank"
                className="inline-flex items-center gap-1 underline hover:text-zinc-900"
              >
                /store/{merchant.slug}
                <ExternalLink className="h-3 w-3" strokeWidth={2.2} />
              </Link>
            </p>
            {merchant.suspendedAt && merchant.suspendedReason && (
              <p className="text-xs text-red-700">停權原因: {merchant.suspendedReason}</p>
            )}
            {merchant.previousSlug && (
              <p className="text-xs text-zinc-500">
                舊 slug: <span className="font-mono">{merchant.previousSlug}</span>
              </p>
            )}
          </div>

          <MerchantActions
            merchantId={id}
            currentSlug={merchant.slug}
            isSuspended={merchant.suspendedAt !== null}
            isPendingApproval={merchant.approvedAt == null}
          />
        </header>

        {/* KPI */}
        <div className="grid gap-4 sm:grid-cols-4">
          <DetailKpi label="商品" value={pStat?.total ?? 0} />
          <DetailKpi label="訂單" value={oStat?.total ?? 0} />
          <DetailKpi label="GMV" value={`NT$ ${((oStat?.gmv ?? 0) / 100).toLocaleString()}`} />
          <DetailKpi
            label="brand voice"
            value={merchant.brandVoice ? '已設' : '未設'}
            sub={merchant.brandVoice ? merchant.brandVoice.slice(0, 30) + (merchant.brandVoice.length > 30 ? '...' : '') : '—'}
          />
        </div>

        {/* Two-col layout: tabs + actionLog */}
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-200">
              <TabLink href={`/admin/merchants/${id}?tab=products`} active={tab === 'products'}>
                商品 ({pStat?.total ?? 0})
              </TabLink>
              <TabLink href={`/admin/merchants/${id}?tab=orders`} active={tab === 'orders'}>
                訂單 ({oStat?.total ?? 0})
              </TabLink>
            </div>

            <div className="mt-4">
              {tab === 'products' ? (
                <ProductsTab list={productList} />
              ) : (
                <OrdersTab list={orderList} />
              )}
            </div>
          </div>

          {/* Right col: admin_action_history */}
          <div className="rounded border border-zinc-200 bg-white p-5">
            <p className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
              admin 動作歷史
            </p>
            {actionLog.length === 0 ? (
              <p className="text-xs text-zinc-400">尚無動作紀錄</p>
            ) : (
              <ul className="space-y-3">
                {actionLog.map((a) => (
                  <li key={a.id} className="text-xs">
                    <p className="font-medium text-zinc-900">{ACTION_LABEL[a.action] ?? a.action}</p>
                    <p className="mt-0.5 text-zinc-500">
                      {a.createdAt.toLocaleDateString('zh-TW')}{' '}
                      {a.createdAt.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {(a.payload as Record<string, unknown>)?.reason ? (
                      <p className="mt-1 italic text-zinc-600">
                        {String((a.payload as Record<string, unknown>).reason)}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

const ACTION_LABEL: Record<string, string> = {
  suspend: '已停權',
  activate: '已啟用',
  rename_slug: '改 slug',
  approve_merchant: '已核可',
};

function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm transition ${
        active
          ? 'border-b-2 border-zinc-900 font-medium text-zinc-900'
          : 'text-zinc-500 hover:text-zinc-900'
      }`}
    >
      {children}
    </Link>
  );
}

function DetailKpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded border border-zinc-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}

function ProductsTab({
  list,
}: {
  list: Array<{
    id: string;
    title: string;
    priceCents: number;
    stockQuantity: number;
    isPublished: boolean;
    createdAt: Date;
  }>;
}) {
  if (list.length === 0)
    return <p className="py-12 text-center text-sm text-zinc-400">尚無商品</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left">
        <tr className="text-xs uppercase tracking-wider text-zinc-500">
          <th className="px-3 py-2 font-medium">標題</th>
          <th className="px-3 py-2 font-medium tabular-nums">售價</th>
          <th className="px-3 py-2 font-medium tabular-nums">庫存</th>
          <th className="px-3 py-2 font-medium">狀態</th>
        </tr>
      </thead>
      <tbody>
        {list.map((p) => (
          <tr key={p.id} className="border-t border-zinc-100">
            <td className="px-3 py-2">{p.title}</td>
            <td className="px-3 py-2 tabular-nums">
              NT$ {(p.priceCents / 100).toLocaleString()}
            </td>
            <td className="px-3 py-2 tabular-nums">{p.stockQuantity}</td>
            <td className="px-3 py-2 text-xs text-zinc-500">
              {p.isPublished ? '已上架' : '草稿'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function OrdersTab({
  list,
}: {
  list: Array<{
    id: string;
    customerEmail: string;
    totalCents: number;
    status: string;
    createdAt: Date;
  }>;
}) {
  if (list.length === 0)
    return <p className="py-12 text-center text-sm text-zinc-400">尚無訂單</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left">
        <tr className="text-xs uppercase tracking-wider text-zinc-500">
          <th className="px-3 py-2 font-medium">編號</th>
          <th className="px-3 py-2 font-medium">顧客</th>
          <th className="px-3 py-2 font-medium tabular-nums">金額</th>
          <th className="px-3 py-2 font-medium">狀態</th>
        </tr>
      </thead>
      <tbody>
        {list.map((o) => (
          <tr key={o.id} className="border-t border-zinc-100">
            <td className="px-3 py-2 font-mono text-xs">#{o.id.slice(0, 8)}</td>
            <td className="px-3 py-2">{o.customerEmail}</td>
            <td className="px-3 py-2 tabular-nums">
              NT$ {(o.totalCents / 100).toLocaleString()}
            </td>
            <td className="px-3 py-2 text-xs text-zinc-500">{o.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
