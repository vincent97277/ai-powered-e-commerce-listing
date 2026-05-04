'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Globe, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { togglePublishAction } from '@/app/(merchant)/merchant/products/[id]/actions';

export function PublishToggle({
  productId,
  initialPublished,
  storefrontSlug,
}: {
  productId: string;
  initialPublished: boolean;
  storefrontSlug?: string;
}) {
  const [published, setPublished] = useState(initialPublished);
  const [pending, start] = useTransition();

  const handle = () => {
    const next = !published;
    start(async () => {
      const result = await togglePublishAction(productId, next);
      if (result.success) {
        setPublished(next);
        if (next) {
          toast.success('已上架到 storefront', {
            description: storefrontSlug ? `現在顧客可以在 /store/${storefrontSlug} 看到並下單` : undefined,
            duration: 4000,
          });
        } else {
          toast('已下架', { duration: 2000 });
        }
      } else {
        toast.error(result.error ?? '操作失敗');
      }
    });
  };

  return (
    <Button
      onClick={handle}
      disabled={pending}
      variant={published ? 'default' : 'outline'}
      className="hover-lift inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
      style={{
        backgroundColor: published ? 'var(--brand-primary)' : 'transparent',
        color: published ? 'var(--brand-bg)' : 'var(--brand-primary)',
        borderColor: 'var(--brand-primary)',
        borderRadius: 'var(--brand-radius)',
        boxShadow: published ? 'var(--elev-2)' : 'none',
      }}
    >
      <motion.span
        animate={{ rotate: pending ? 360 : 0 }}
        transition={{ duration: 0.4, repeat: pending ? Infinity : 0 }}
        className="inline-block"
      >
        {published ? <Globe className="h-4 w-4" strokeWidth={2} /> : <Lock className="h-4 w-4" strokeWidth={2} />}
      </motion.span>
      {pending ? '處理中...' : published ? '已上架, 點此下架' : '上架到 storefront'}
    </Button>
  );
}
