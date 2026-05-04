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
import { StatusChip, type StatusChipTone } from '@/components/ui/StatusChip';
import { EmptyState } from '@/components/feedback/EmptyState';

export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, { text: string; tone: StatusChipTone; color: string }> = {
  pending: { text: '待付款', tone: 'warning', color: 'var(--warning)' },
  paid: { text: '已付款', tone: 'info', color: 'var(--info)' },
  shipped: { text: '已出貨', tone: 'info', color: 'var(--info)' },
  completed: { text: '已完成', tone: 'success', color: 'var(--success)' },
  failed: { text: '失敗', tone: 'error', color: 'var(--error)' },
  refunded: { text: '已退款', tone: 'neutral', color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' },
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
      className="min-h-screen px-4 py-6 sm:px-8 sm:py-8 lg:px-12 lg:py-10"
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
          <nav className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
            <div className="-mx-4 flex items-center gap-2 overflow-x-auto whitespace-nowrap px-4 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
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
            </div>
            <div className="sm:ml-auto">
              <ExportDropdown
                kind="orders"
                currentFilter={{ status: filterStatus ?? undefined }}
              />
            </div>
          </nav>
        </header>

        {rows.length === 0 ? (
          <EmptyState
            icon={ShoppingCart}
            title="還沒有訂單"
            body="上架商品後, 顧客下單會出現在這"
            primaryCTA={{ label: `預覽店面 /store/${merchant.slug}`, href: `/store/${merchant.slug}` }}
            tone="brand"
          />
        ) : (
          <>
            {/* Mobile card list (<md) */}
            <div className="space-y-3 md:hidden">
              {rows.map((o) => {
                const status = STATUS_LABEL[o.status] ?? { text: o.status, color: 'inherit' };
                return (
                  <Link
                    key={o.id}
                    href={`/merchant/orders/${o.id}`}
                    className="block border p-3"
                    style={{
                      borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                      borderRadius: 'var(--brand-radius)',
                      backgroundColor: 'var(--brand-bg)',
                    }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="t-tabular font-mono text-xs" style={{ color: 'var(--brand-primary)' }}>
                        #{o.id.slice(0, 8)}
                      </span>
                      <StatusChip tone={status.tone} label={status.text} />
                    </div>
                    <p className="mt-2 truncate text-sm">{o.customerEmail}</p>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="t-tabular text-base font-semibold" style={{ color: 'var(--brand-primary)' }}>
                        NT$ {(o.totalCents / 100).toLocaleString()}
                      </span>
                      <span className="text-xs tabular-nums opacity-50">
                        {o.itemCount} 件 · {formatRelative(o.createdAt)}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Desktop table (md+) */}
            <div
              className="hidden overflow-hidden border md:block"
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
                        <StatusChip tone={status.tone} label={status.text} />
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
          </>
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
      className="inline-flex shrink-0 items-center rounded px-3 py-2 text-xs font-medium transition sm:py-1.5"
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
