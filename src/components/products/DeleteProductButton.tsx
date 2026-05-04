'use client';

import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { deleteProductAction } from '@/app/(merchant)/merchant/products/[id]/actions';

export function DeleteProductButton({ productId, title }: { productId: string; title: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();

  const handle = () => {
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
    <Button
      variant="ghost"
      size="sm"
      onClick={handle}
      disabled={pending}
      className="inline-flex items-center gap-2"
      style={{
        color: confirming ? 'var(--error)' : 'color-mix(in srgb, var(--brand-text) 50%, transparent)',
      }}
    >
      <Trash2 className="h-3.5 w-3.5" strokeWidth={2.2} />
      {confirming ? `再點一次刪除「${title.slice(0, 12)}...」` : '刪除這件商品'}
    </Button>
  );
}
