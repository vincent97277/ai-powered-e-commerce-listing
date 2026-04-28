'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegenerateButton } from './RegenerateButton';

export function ProductHeader({ title, status, productId }: { title: string; status: 'draft' | 'published'; productId: string }) {
  return (
    <header className="flex items-start justify-between gap-6 border-b pb-6">
      <div className="space-y-3">
        <Badge style={{
          backgroundColor: status === 'published' ? 'var(--brand-primary)' : 'transparent',
          borderColor: 'var(--brand-primary)',
          color: status === 'published' ? 'var(--brand-bg)' : 'var(--brand-primary)',
          borderRadius: 'var(--brand-radius)',
        }} className="border">
          {status === 'published' ? '已上架' : '草稿'}
        </Badge>
        <h1 className="text-5xl leading-tight" style={{ fontFamily: 'var(--brand-font-heading)', color: 'var(--brand-text)' }}>
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 gap-2">
        <RegenerateButton productId={productId} />
        <Button style={{ backgroundColor: 'var(--brand-primary)', borderRadius: 'var(--brand-radius)' }}>
          上架到蝦皮
        </Button>
      </div>
    </header>
  );
}
