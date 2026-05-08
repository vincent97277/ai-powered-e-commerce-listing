'use client';

/**
 * MerchantActions — admin actions UI (V1 #50, logic in #51 actions.ts)
 * Linear-tone: minimal chrome, confirmation dialogs use native dialog (V1 does not pull in the shadcn dialog wrapper)
 */
import { useState, useTransition } from 'react';
import {
  suspendMerchant,
  activateMerchant,
  renameSlug,
  approveMerchant,
} from './actions';
import { toast } from 'sonner';

export function MerchantActions({
  merchantId,
  currentSlug,
  isSuspended,
  isPendingApproval,
}: {
  merchantId: string;
  currentSlug: string;
  isSuspended: boolean;
  /** V1.7 D1: approved_at IS NULL → show the "Approve" button (high priority, listed first) */
  isPendingApproval: boolean;
}) {
  const [pending, start] = useTransition();
  const [showSuspend, setShowSuspend] = useState(false);
  const [showRename, setShowRename] = useState(false);

  function handleSuspend(formData: FormData) {
    start(async () => {
      const reason = String(formData.get('reason') ?? '').trim();
      if (!reason) {
        toast.error('請填停權原因');
        return;
      }
      const result = await suspendMerchant(merchantId, reason);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success('已停權');
        setShowSuspend(false);
      }
    });
  }

  function handleActivate() {
    if (!confirm('確認啟用此商家?')) return;
    start(async () => {
      const result = await activateMerchant(merchantId);
      if (result.error) toast.error(result.error);
      else toast.success('已啟用');
    });
  }

  function handleApprove() {
    if (!confirm('核可此商家? 核可後 storefront 對外開放, 商家可上架商品.')) return;
    start(async () => {
      const result = await approveMerchant(merchantId);
      if (result.error) toast.error(result.error);
      else toast.success('已核可, storefront 對外開放');
    });
  }

  function handleRename(formData: FormData) {
    start(async () => {
      const newSlug = String(formData.get('newSlug') ?? '').trim();
      if (!newSlug) {
        toast.error('請填新 slug');
        return;
      }
      const result = await renameSlug(merchantId, newSlug);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`slug 改為 ${newSlug}`);
        setShowRename(false);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {isPendingApproval && (
        <button
          onClick={handleApprove}
          disabled={pending}
          className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-60"
          aria-label="核可此商家"
        >
          核可商家
        </button>
      )}
      {isSuspended ? (
        <button
          onClick={handleActivate}
          disabled={pending}
          className="rounded border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
        >
          啟用商家
        </button>
      ) : (
        <button
          onClick={() => setShowSuspend(true)}
          disabled={pending}
          className="rounded border border-red-300 bg-red-50 px-3 py-1.5 text-sm text-red-700 hover:bg-red-100 disabled:opacity-60"
        >
          停權
        </button>
      )}

      <button
        onClick={() => setShowRename(true)}
        disabled={pending}
        className="rounded border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
      >
        改 slug
      </button>

      {/* Suspend dialog */}
      {showSuspend && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowSuspend(false)}
        >
          <div className="w-full max-w-md rounded border border-zinc-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">停權商家</h2>
            <p className="mt-1 text-sm text-zinc-500">
              storefront 會顯示「暫停營業中」, 商家無法上架商品但仍可處理 in-flight 訂單
            </p>
            <form
              action={handleSuspend}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700">停權原因 (商家會看到)</label>
                <textarea
                  name="reason"
                  required
                  rows={3}
                  maxLength={500}
                  className="mt-1.5 block w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900"
                  placeholder="例: 違反平台規範, 詳見 email 通知"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowSuspend(false)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-60"
                >
                  {pending ? '停權中...' : '確認停權'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rename dialog */}
      {showRename && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowRename(false)}
        >
          <div className="w-full max-w-md rounded border border-zinc-200 bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold">改 slug</h2>
            <p className="mt-1 text-sm text-zinc-500">
              舊 slug <span className="font-mono">{currentSlug}</span> 會 301 redirect 到新 slug (1 層 history)
            </p>
            <form
              action={handleRename}
              className="mt-4 space-y-3"
            >
              <div>
                <label className="block text-xs font-medium text-zinc-700">新 slug (3-32 字, 小寫英數加橫線)</label>
                <input
                  name="newSlug"
                  required
                  pattern="[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])"
                  minLength={3}
                  maxLength={32}
                  className="mt-1.5 block w-full rounded border border-zinc-300 px-3 py-2 font-mono text-sm outline-none focus:border-zinc-900"
                  placeholder="new-slug"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRename(false)}
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
                >
                  {pending ? '改名中...' : '確認改名'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
