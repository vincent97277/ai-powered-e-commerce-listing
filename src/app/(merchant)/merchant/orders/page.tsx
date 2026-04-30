/**
 * 商家訂單列表 — 透過 RLS 只看到自己的訂單
 */
import Link from 'next/link';
import { cookies } from 'next/headers';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderItems } from '@/db/schema';
import { desc, eq, sql } from 'drizzle-orm';
import { ShoppingCart } from 'lucide-react';
import { ExportDropdown } from '@/components/merchant/ExportDropdown';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; color: string }> = {
  pending: { text: '待付款', color: 'var(--warning)' },
  paid: { text: '已付款', color: 'var(--info)' },
  shipped: { text: '已出貨', color: '#3B82F6' },
  completed: { text: '已完成', color: 'var(--success)' },
  failed: { text: '失敗', color: 'var(--error)' },
  refunded: { text: '已退款', color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' },
};

const STATUS_FILTERS = ['pending', 'paid', 'shipped', 'completed', 'refunded'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

function isValidStatusFilter(s: unknown): s is StatusFilter {
  return typeof s === 'string' && (STATUS_FILTERS as readonly string[]).includes(s);
}

export default async function MerchantOrdersList({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const filterStatus = isValidStatusFilter(params.status) ? params.status : null;

  const c = await cookies();
  const merchant = await resolveMerchantFromCookie(c.get('demo-merchant-id')?.value);

  const rows = await withTenantTx(merchant.tenantId, async (tx) => {
    const baseQuery = tx
      .select({
        id: orders.id,
        customerEmail: orders.customerEmail,
        totalCents: orders.totalCents,
        status: orders.status,
        createdAt: orders.createdAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM ${orderItems} WHERE ${orderItems.orderId} = ${orders.id})`.mapWith(Number),
      })
      .from(orders);

    return filterStatus
      ? await baseQuery.where(eq(orders.status, filterStatus)).orderBy(desc(orders.createdAt)).limit(100)
      : await baseQuery.orderBy(desc(orders.createdAt)).limit(100);
  });

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-4">
          <div>
            <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
              訂單管理
            </p>
            <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              訂單列表
            </h1>
            <p className="t-small mt-1 opacity-60">
              {filterStatus
                ? `${STATUS_LABEL[filterStatus]?.text ?? filterStatus} ${rows.length} 筆`
                : `共 ${rows.length} 筆`}{' '}
              · 總計 NT$ {(rows.reduce((s, r) => s + r.totalCents, 0) / 100).toLocaleString()}
            </p>
          </div>

          {/* Filter chips + Export */}
          <nav className="flex flex-wrap items-center gap-2">
            <FilterChip href="/merchant/orders" active={filterStatus === null} label="全部" />
            {STATUS_FILTERS.map((s) => (
              <FilterChip
                key={s}
                href={`/merchant/orders?status=${s}`}
                active={filterStatus === s}
                label={STATUS_LABEL[s]?.text ?? s}
                color={STATUS_LABEL[s]?.color}
              />
            ))}
            <div className="ml-auto">
              <ExportDropdown
                kind="orders"
                currentFilter={{ status: filterStatus ?? undefined }}
              />
            </div>
          </nav>
        </header>

        {rows.length === 0 ? (
          <div
            className="flex flex-col items-center justify-center gap-4 py-24 text-center"
            style={{
              borderRadius: 'calc(var(--brand-radius) * 4)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
              border: '1px dashed color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            }}
          >
            <ShoppingCart className="h-12 w-12 opacity-50" strokeWidth={1.4} style={{ color: 'var(--brand-primary)' }} />
            <p className="t-h3" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              還沒有訂單
            </p>
            <p className="t-small opacity-60">
              先把商品上架, 顧客才下得了單。
              <br />
              預覽你的店面: <Link href={`/store/${merchant.slug}`} target="_blank" className="underline" style={{ color: 'var(--brand-primary)' }}>/store/{merchant.slug}</Link>
            </p>
          </div>
        ) : (
          <div
            className="overflow-hidden border"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'var(--brand-bg)',
            }}
          >
            <table className="w-full">
              <thead
                style={{
                  borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                }}
              >
                <tr className="text-left">
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>訂單編號</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>顧客</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>件數</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>金額</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>狀態</th>
                  <th className="t-caption px-4 py-3 font-medium" style={{ color: 'var(--brand-primary)' }}>時間</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((o, i) => {
                  const status = STATUS_LABEL[o.status] ?? { text: o.status, color: 'inherit' };
                  return (
                    <tr
                      key={o.id}
                      className="hover:bg-brand-soft cursor-pointer transition-colors"
                      style={{
                        borderBottom: i < rows.length - 1
                          ? '1px solid color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                          : undefined,
                      }}
                    >
                      <td className="t-tabular px-4 py-3 font-mono text-xs">
                        <Link href={`/merchant/orders/${o.id}`} className="hover:underline" style={{ color: 'var(--brand-primary)' }}>
                          #{o.id.slice(0, 8)}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <Link href={`/merchant/orders/${o.id}`} className="hover:underline">
                          {o.customerEmail}
                        </Link>
                      </td>
                      <td className="t-tabular px-4 py-3 text-sm opacity-70">{o.itemCount} 件</td>
                      <td className="t-tabular px-4 py-3 text-sm font-semibold" style={{ color: 'var(--brand-primary)' }}>
                        NT$ {(o.totalCents / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs"
                          style={{
                            backgroundColor: `color-mix(in srgb, ${status.color} 12%, transparent)`,
                            color: status.color,
                            borderRadius: 'var(--brand-radius)',
                          }}
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status.color }} />
                          {status.text}
                        </span>
                      </td>
                      <td className="t-small px-4 py-3 opacity-50 tabular-nums">
                        {formatRelative(o.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function FilterChip({
  href,
  active,
  label,
  color,
}: {
  href: string;
  active: boolean;
  label: string;
  color?: string;
}) {
  const accent = color ?? 'var(--brand-primary)';
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded px-3 py-1.5 text-xs font-medium transition"
      style={
        active
          ? {
              backgroundColor: accent,
              color: 'var(--brand-bg)',
              borderRadius: 'var(--brand-radius)',
            }
          : {
              border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)',
              color: 'var(--brand-text)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'transparent',
            }
      }
    >
      {label}
    </Link>
  );
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return '剛剛';
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} 天前`;
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' });
}
