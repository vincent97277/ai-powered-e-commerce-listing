'use client';

import { Button } from '@/components/ui/button';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

export function RegenerateButton({ productId }: { productId: string }) {
  const [pending, start] = useTransition();
  const [spin, setSpin] = useState(false);
  const router = useRouter();

  const handle = () => {
    setSpin(true);
    start(async () => {
      // Hackathon: 800ms 假延遲後 refresh，藉 brand voice 切換看 theme transition
      // productId 留著給未來真實 regenerate API 用
      void productId;
      await new Promise((r) => setTimeout(r, 800));
      router.refresh();
      setSpin(false);
    });
  };

  return (
    <Button
      variant="outline"
      onClick={handle}
      disabled={pending}
      style={{
        borderColor: 'var(--brand-primary)',
        color: 'var(--brand-primary)',
        borderRadius: 'var(--brand-radius)',
      }}
    >
      <span className={spin ? 'inline-block animate-spin' : ''}>↻</span>
      <span className="ml-2">用此風格重新生成</span>
    </Button>
  );
}
