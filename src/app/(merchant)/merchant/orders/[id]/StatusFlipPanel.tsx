'use client';

/**
 * Status flip UI (V1 #55)
 * - 依當前狀態顯示對應 transition button
 * - shipped 要填 trackingNumber + carrier
 * - refunded 要填 reason + confirm dialog (不可逆警告)
 */
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Truck, Package, RefreshCcw } from 'lucide-react';
import { markPaid, markShipped, markCompleted, markRefunded } from './actions';

const CARRIERS = ['711', '全家', '黑貓', '郵局', '其他'] as const;

export function StatusFlipPanel({
  orderId,
  currentStatus,
  trackingNumber,
  carrier,
}: {
  orderId: string;
  currentStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
}) {
  const [pending, start] = useTransition();
  const [showShip, setShowShip] = useState(false);
  const [showRefund, setShowRefund] = useState(false);

  function handleMarkPaid() {
    start(async () => {
      const r = await markPaid(orderId);
      if (r.success) toast.success('已標記為已付款');
      else toast.error(r.error ?? '操作失敗');
    });
  }

  function handleShip(formData: FormData) {
    const tn = String(formData.get('trackingNumber') ?? '');
    const c = String(formData.get('carrier') ?? '');
    start(async () => {
      const r = await markShipped(orderId, tn, c);
      if (r.success) {
        toast.success('已標記為已出貨');
        setShowShip(false);
      } else {
        toast.error(r.error ?? '操作失敗');
      }
    });
  }

  function handleComplete() {
    start(async () => {
      const r = await markCompleted(orderId);
      if (r.success) toast.success('訂單完成');
      else toast.error(r.error ?? '操作失敗');
    });
  }

  function handleRefund(formData: FormData) {
    const reason = String(formData.get('reason') ?? '');
    start(async () => {
      const r = await markRefunded(orderId, reason, currentStatus);
      if (r.success) {
        toast.success('已標記為退款');
        setShowRefund(false);
      } else {
        toast.error(r.error ?? '退款失敗');
      }
    });
  }

  // Refunded 是 dead-end, 不顯示 panel
  if (currentStatus === 'refunded') {
    return (
      <div
        className="rounded p-4 text-sm"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--brand-text) 6%, transparent)',
          color: 'var(--brand-text)',
        }}
      >
        此訂單已退款, 無法再切換狀態 (V1 dead-end, V2 開放 cancelled recovery)
      </div>
    );
  }

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded p-4"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
        border: '1px solid color-mix(in srgb, var(--brand-primary) 16%, transparent)',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <span className="text-sm font-medium">下一步:</span>

      {currentStatus === 'pending' && (
        <button
          type="button"
          onClick={handleMarkPaid}
          disabled={pending}
          className="hover-lift inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.4} />
          標為已付款
        </button>
      )}

      {currentStatus === 'paid' && (
        <button
          type="button"
          onClick={() => setShowShip(true)}
          disabled={pending}
          className="hover-lift inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <Truck className="h-3.5 w-3.5" strokeWidth={2.4} />
          標為已出貨
        </button>
      )}

      {currentStatus === 'shipped' && (
        <button
          type="button"
          onClick={handleComplete}
          disabled={pending}
          className="hover-lift inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <Package className="h-3.5 w-3.5" strokeWidth={2.4} />
          標為已完成
        </button>
      )}

      {/* 退款 button (always available, except refunded) */}
      <button
        type="button"
        onClick={() => setShowRefund(true)}
        disabled={pending}
        className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-sm"
        style={{
          border: '1px solid color-mix(in srgb, var(--error) 40%, transparent)',
          color: 'var(--error)',
          borderRadius: 'var(--brand-radius)',
        }}
      >
        <RefreshCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
        退款
      </button>

      {/* Ship dialog */}
      {showShip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowShip(false)}
        >
          <div
            className="w-full max-w-md p-6"
            style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)', borderRadius: 'var(--brand-radius)' }}
          >
            <h2 className="t-h3 font-semibold" style={{ fontFamily: 'var(--brand-font-heading)' }}>
              標記為已出貨
            </h2>
            <p className="mt-1 text-sm opacity-60">填寫物流商 + 單號, 顧客也會在訂單詳情看到</p>
            <form action={handleShip} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium opacity-70">物流商</label>
                <select
                  name="carrier"
                  required
                  defaultValue={carrier ?? '711'}
                  className="mt-1.5 block w-full border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)', borderRadius: 'var(--brand-radius)', color: 'var(--brand-text)' }}
                >
                  {CARRIERS.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium opacity-70">單號</label>
                <input
                  name="trackingNumber"
                  required
                  defaultValue={trackingNumber ?? ''}
                  maxLength={50}
                  className="mt-1.5 block w-full border bg-transparent px-3 py-2 font-mono text-sm"
                  style={{ borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)', borderRadius: 'var(--brand-radius)', color: 'var(--brand-text)' }}
                  placeholder="123456789012"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowShip(false)} className="px-3 py-1.5 text-sm opacity-60 hover:opacity-100">取消</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-3 py-1.5 text-sm font-medium"
                  style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--brand-bg)', borderRadius: 'var(--brand-radius)' }}
                >
                  {pending ? '處理中...' : '確認出貨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund dialog */}
      {showRefund && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowRefund(false)}
        >
          <div
            className="w-full max-w-md p-6"
            style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)', borderRadius: 'var(--brand-radius)' }}
          >
            <h2 className="t-h3 font-semibold" style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--error)' }}>
              退款 (不可逆)
            </h2>
            <p className="mt-1 text-sm opacity-70">
              切到「已退款」後此訂單<strong>無法回到其他狀態</strong>。 V2 才會開放 cancelled recovery。
            </p>
            <form action={handleRefund} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium opacity-70">退款原因 (顧客可看到)</label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  maxLength={500}
                  className="mt-1.5 block w-full border bg-transparent px-3 py-2 text-sm"
                  style={{ borderColor: 'color-mix(in srgb, var(--error) 30%, transparent)', borderRadius: 'var(--brand-radius)', color: 'var(--brand-text)' }}
                  placeholder="例: 顧客取消訂單, 已協調退款"
                />
              </div>
              <p className="text-xs opacity-50">
                Rate limit: 每商家每小時最多 5 件退款 (防誤點)
              </p>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowRefund(false)} className="px-3 py-1.5 text-sm opacity-60 hover:opacity-100">取消</button>
                <button
                  type="submit"
                  disabled={pending}
                  className="px-3 py-1.5 text-sm font-medium text-white"
                  style={{ backgroundColor: 'var(--error)', borderRadius: 'var(--brand-radius)' }}
                >
                  {pending ? '處理中...' : '確認退款'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
