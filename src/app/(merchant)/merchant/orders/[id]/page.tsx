/**
 * Merchant order detail page (V1 #54)
 * - Customer info (email/name/phone/address)
 * - Order line items (items + unit price + quantity)
 * - Internal note field
 * - status badge + status flip panel (#55 client component)
 * - audit timeline at the bottom
 * - PrintableInvoice (#57)
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { withTenantTx } from '@/lib/db/with-tenant';
import { orders, orderItems, orderStatusHistory, products } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';
import { ArrowLeft, Printer } from 'lucide-react';
import { StatusFlipPanel } from './StatusFlipPanel';
import { PrintableInvoice } from './PrintableInvoice';
import { updateInternalNoteForm } from './actions';

export const dynamic = 'force-dynamic';

const STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: '待付款', color: 'var(--warning)' },
  paid: { label: '已付款', color: 'var(--info)' },
  shipped: { label: '已出貨', color: '#3B82F6' },
  completed: { label: '已完成', color: 'var(--success)' },
  failed: { label: '失敗', color: 'var(--error)' },
  refunded: { label: '已退款', color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' },
};

export default async function MerchantOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const merchant = await resolveMerchantFromCookie();

  // Single withTenantTx fetches everything
  const data = await withTenantTx(merchant.tenantId, async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, id))
      .limit(1);
    if (!order) return null;

    const items = await tx
      .select({
        id: orderItems.id,
        quantity: orderItems.quantity,
        unitPriceCents: orderItems.unitPriceCents,
        productId: orderItems.productId,
        productTitle: products.title,
        productR2Key: products.r2Key,
      })
      .from(orderItems)
      .leftJoin(products, eq(products.id, orderItems.productId))
      .where(eq(orderItems.orderId, id));

    const history = await tx
      .select()
      .from(orderStatusHistory)
      .where(eq(orderStatusHistory.orderId, id))
      .orderBy(desc(orderStatusHistory.createdAt));

    return { order, items, history };
  });

  if (!data) notFound();
  const { order, items, history } = data;

  const subtotalCents = items.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const statusMeta = STATUS_META[order.status] ?? { label: order.status, color: 'inherit' };

  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-4xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/merchant/orders"
            className="inline-flex items-center gap-1 text-sm opacity-60 hover:opacity-100"
            style={{ color: 'var(--brand-text)' }}
          >
            <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2.2} />
            回訂單列表
          </Link>
          <button
            type="button"
            data-print-trigger
            className="hover-lift inline-flex items-center gap-2 px-4 py-2 text-sm"
            style={{
              border: '1px solid color-mix(in srgb, var(--brand-primary) 28%, transparent)',
              color: 'var(--brand-primary)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            <Printer className="h-4 w-4" strokeWidth={2.2} />
            列印出貨單
          </button>
        </div>

        <header className="space-y-2">
          <p className="t-caption font-mono opacity-50">訂單編號</p>
          <h1
            className="t-h1 font-mono"
            style={{ fontFamily: 'var(--brand-font-heading)' }}
          >
            #{order.id.slice(0, 8)}
          </h1>
          <div className="flex items-center gap-3">
            <span
              className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${statusMeta.color} 12%, transparent)`,
                color: statusMeta.color,
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: statusMeta.color }}
              />
              {statusMeta.label}
            </span>
            <span className="text-sm opacity-60">
              建立於 {order.createdAt.toLocaleString('zh-TW')}
            </span>
          </div>
        </header>

        {/* Status flip panel */}
        <StatusFlipPanel
          orderId={order.id}
          currentStatus={order.status}
          trackingNumber={order.trackingNumber}
          carrier={order.carrier}
        />

        {/* Two-col: customer info + items */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Customer info */}
          <div
            className="space-y-4 border p-6"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
            }}
          >
            <p className="t-caption font-medium opacity-60">收件人資訊</p>
            <div className="space-y-3 text-sm">
              <Field label="姓名" value={order.customerName ?? '—'} />
              <Field label="Email" value={order.customerEmail} />
              <Field label="電話" value={order.customerPhone ?? '—'} />
              <Field label="地址" value={order.customerAddress ?? '—'} multiline />
            </div>
            {(order.trackingNumber || order.carrier) && (
              <div className="space-y-2 border-t pt-3" style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)' }}>
                <p className="t-caption font-medium opacity-60">出貨資訊</p>
                <Field label="物流商" value={order.carrier ?? '—'} />
                <Field label="單號" value={order.trackingNumber ?? '—'} />
              </div>
            )}
          </div>

          {/* Items + total */}
          <div className="lg:col-span-2 space-y-4">
            <p className="t-caption font-medium opacity-60">訂單明細 ({items.length} 件)</p>
            <div
              className="overflow-hidden border"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              <table className="w-full text-sm">
                <thead>
                  <tr
                    className="text-left text-xs"
                    style={{
                      borderBottom: '1px solid color-mix(in srgb, var(--brand-primary) 14%, transparent)',
                      backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
                    }}
                  >
                    <th className="px-4 py-2 font-medium opacity-60">商品</th>
                    <th className="px-4 py-2 font-medium tabular-nums opacity-60">單價</th>
                    <th className="px-4 py-2 font-medium tabular-nums opacity-60">數量</th>
                    <th className="px-4 py-2 font-medium tabular-nums opacity-60">小計</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr
                      key={it.id}
                      style={{
                        borderBottom:
                          i < items.length - 1
                            ? '1px solid color-mix(in srgb, var(--brand-primary) 8%, transparent)'
                            : undefined,
                      }}
                    >
                      <td className="px-4 py-3">{it.productTitle ?? '(已刪除)'}</td>
                      <td className="px-4 py-3 tabular-nums">
                        NT$ {(it.unitPriceCents / 100).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums">×{it.quantity}</td>
                      <td className="px-4 py-3 tabular-nums font-medium">
                        NT$ {((it.unitPriceCents * it.quantity) / 100).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr
                    style={{
                      borderTop: '2px solid color-mix(in srgb, var(--brand-primary) 18%, transparent)',
                    }}
                  >
                    <td colSpan={3} className="px-4 py-3 text-right font-medium">
                      總計
                    </td>
                    <td
                      className="px-4 py-3 tabular-nums text-lg font-bold"
                      style={{ color: 'var(--brand-primary)' }}
                    >
                      NT$ {(order.totalCents / 100).toLocaleString()}
                    </td>
                  </tr>
                  {subtotalCents !== order.totalCents && (
                    <tr>
                      <td colSpan={4} className="px-4 py-1 text-right text-xs opacity-50">
                        items 加總 NT$ {(subtotalCents / 100).toLocaleString()} ≠ orders.total_cents (歷史漂移可忽略)
                      </td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>

            {/* Internal note */}
            <InternalNoteForm orderId={order.id} initialNote={order.internalNote} />
          </div>
        </div>

        {/* Audit timeline */}
        {history.length > 0 && (
          <div
            className="space-y-4 border p-6"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
              borderRadius: 'var(--brand-radius)',
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 2%, var(--brand-bg))',
            }}
          >
            <p className="t-caption font-medium opacity-60">狀態流轉歷史</p>
            <ol className="space-y-3">
              {history.map((h) => (
                <li key={h.id} className="flex items-start gap-3 text-sm">
                  <span
                    className="mt-1 inline-block h-1.5 w-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: 'var(--brand-primary)' }}
                  />
                  <div className="flex-1">
                    <p>
                      <span className="opacity-60">{STATUS_META[h.fromStatus]?.label ?? h.fromStatus}</span>
                      <span className="mx-2 opacity-40">→</span>
                      <span className="font-medium">{STATUS_META[h.toStatus]?.label ?? h.toStatus}</span>
                      <span className="ml-3 text-xs opacity-50">by {h.changedBy}</span>
                    </p>
                    {h.note && <p className="mt-1 text-xs italic opacity-70">{h.note}</p>}
                    <p className="mt-0.5 text-xs opacity-40 tabular-nums">
                      {h.createdAt.toLocaleString('zh-TW')}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Printable invoice (hidden until @media print) */}
      <PrintableInvoice
        merchantName={merchant.name}
        merchantSlug={merchant.slug}
        order={order}
        items={items}
      />
    </main>
  );
}

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <p className="text-xs opacity-50">{label}</p>
      <p className={`mt-0.5 ${multiline ? 'whitespace-pre-wrap' : ''}`}>{value}</p>
    </div>
  );
}

function InternalNoteForm({
  orderId,
  initialNote,
}: {
  orderId: string;
  initialNote: string | null;
}) {
  const saveNote = updateInternalNoteForm.bind(null, orderId);
  return (
    <div className="space-y-2">
      <p className="t-caption font-medium opacity-60">內部備註 (僅商家可見)</p>
      <form action={saveNote}>
        <textarea
          name="note"
          defaultValue={initialNote ?? ''}
          maxLength={500}
          rows={3}
          placeholder="記錄出貨注意事項 / 顧客特殊需求..."
          className="w-full border bg-transparent px-3 py-2 text-sm"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)',
            borderRadius: 'var(--brand-radius)',
            color: 'var(--brand-text)',
          }}
        />
        <div className="mt-2 flex items-center justify-between text-xs opacity-50">
          <span>最多 500 字</span>
          <button
            type="submit"
            className="rounded px-3 py-1 text-xs"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
              color: 'var(--brand-primary)',
            }}
          >
            儲存備註
          </button>
        </div>
      </form>
    </div>
  );
}
