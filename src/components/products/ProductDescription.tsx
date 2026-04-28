'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function ProductDescription({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 180;
  const display = expanded || !isLong ? text : text.slice(0, 180) + '…';
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider opacity-60">商品描述</h2>
      <p className="leading-loose" style={{ color: 'var(--brand-text)' }}>
        {display}
      </p>
      {isLong && (
        <Button variant="link" onClick={() => setExpanded((s) => !s)} className="px-0">
          {expanded ? '收合 ↑' : '展開全文 ↓'}
        </Button>
      )}
    </section>
  );
}
