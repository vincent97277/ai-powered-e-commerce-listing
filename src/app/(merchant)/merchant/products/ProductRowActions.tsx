'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Edit3, Trash2, Globe, Lock, ExternalLink } from 'lucide-react';
import {
  togglePublishAction,
  deleteProductAction,
} from './[id]/actions';

export function ProductRowActions({
  productId,
  isPublished,
  merchantSlug,
}: {
  productId: string;
  isPublished: boolean;
  merchantSlug: string;
  title: string;
}) {
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);

  const handleToggle = () => {
    start(async () => {
      const next = !isPublished;
      const r = await togglePublishAction(productId, next);
      if (r.success) {
        toast.success(next ? '已上架到 storefront' : '已下架');
      } else {
        toast.error(r.error ?? '操作失敗');
      }
    });
  };

  const handleDelete = () => {
    if (!confirming) {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 4000);
      return;
    }
    start(async () => {
      const r = await deleteProductAction(productId);
      if (r && !r.success) toast.error(r.error ?? '刪除失敗');
    });
  };

  return (
    <div className="flex items-center justify-end gap-1">
      {isPublished && (
        <Link
          href={`/store/${merchantSlug}/products/${productId}`}
          target="_blank"
          title="從顧客視角看"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2.5 transition-colors hover:bg-brand-soft sm:min-h-0 sm:min-w-0 sm:p-2"
          style={{ color: 'var(--brand-primary)' }}
        >
          <ExternalLink className="h-4 w-4" strokeWidth={2.2} />
        </Link>
      )}

      <Link
        href={`/merchant/products/${productId}`}
        title="編輯詳情"
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2.5 transition-colors hover:bg-brand-soft sm:min-h-0 sm:min-w-0 sm:p-2"
        style={{ color: 'var(--brand-primary)' }}
      >
        <Edit3 className="h-4 w-4" strokeWidth={2.2} />
      </Link>

      <button
        type="button"
        disabled={pending}
        onClick={handleToggle}
        title={isPublished ? '下架' : '上架'}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2.5 transition-colors hover:bg-brand-soft disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:p-2"
        style={{ color: 'var(--brand-primary)' }}
      >
        {isPublished ? <Lock className="h-4 w-4" strokeWidth={2.2} /> : <Globe className="h-4 w-4" strokeWidth={2.2} />}
      </button>

      <button
        type="button"
        disabled={pending}
        onClick={handleDelete}
        title={confirming ? '再點一次確認刪除' : '刪除'}
        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded p-2.5 transition-colors hover:bg-brand-soft disabled:opacity-50 sm:min-h-0 sm:min-w-0 sm:p-2"
        style={{
          color: confirming ? 'var(--error)' : 'color-mix(in srgb, var(--brand-text) 50%, transparent)',
        }}
      >
        <Trash2 className="h-4 w-4" strokeWidth={2.2} />
      </button>

      {confirming && (
        <span className="text-xs" style={{ color: 'var(--error)' }}>
          再點刪除
        </span>
      )}
    </div>
  );
}
