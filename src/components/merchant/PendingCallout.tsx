// DEPRECATED V1.6: replaced by MerchantInbox. Kept one release for rollback. Delete in V1.7.
/**
 * PendingCallout — 商家 dashboard 待處理 callout (V1 #72)
 *
 * 1 個 callout + 3 chip:
 *   - 待付款 → /merchant/orders?status=pending
 *   - 待出貨 → /merchant/orders?status=paid
 *   - 低庫存 → /merchant/products?filter=low-stock
 *
 * 全 0 → 整個 callout 不顯示
 *
 * Server component, 沒 client 互動
 */
import Link from 'next/link';
import { AlertCircle } from 'lucide-react';

export function PendingCallout({
  pendingOrders,
  paidOrders,
  lowStockCount,
  lowStockThreshold,
}: {
  pendingOrders: number;
  paidOrders: number;
  lowStockCount: number;
  lowStockThreshold: number;
}) {
  if (pendingOrders === 0 && paidOrders === 0 && lowStockCount === 0) {
    return null;
  }

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded p-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--warning) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--warning) 24%, transparent)',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <AlertCircle className="h-4 w-4 shrink-0" style={{ color: 'var(--warning)' }} strokeWidth={2.4} />
      <span className="text-sm font-medium">⚡ 待處理:</span>

      {pendingOrders > 0 && (
        <Link
          href="/merchant/orders?status=pending"
          className="hover-lift inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium tabular-nums"
          style={{
            backgroundColor: 'var(--brand-bg)',
            color: 'var(--warning)',
            border: '1px solid color-mix(in srgb, var(--warning) 30%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          {pendingOrders} 筆待付款
        </Link>
      )}

      {paidOrders > 0 && (
        <Link
          href="/merchant/orders?status=paid"
          className="hover-lift inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium tabular-nums"
          style={{
            backgroundColor: 'var(--brand-bg)',
            color: 'var(--info)',
            border: '1px solid color-mix(in srgb, var(--info) 30%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          {paidOrders} 筆待出貨
        </Link>
      )}

      {lowStockCount > 0 && (
        <Link
          href="/merchant/products?filter=low-stock"
          className="hover-lift inline-flex items-center gap-1 rounded px-3 py-1 text-xs font-medium tabular-nums"
          style={{
            backgroundColor: 'var(--brand-bg)',
            color: 'var(--error)',
            border: '1px solid color-mix(in srgb, var(--error) 30%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          {lowStockCount} 件低庫存 (≤{lowStockThreshold})
        </Link>
      )}
    </div>
  );
}
