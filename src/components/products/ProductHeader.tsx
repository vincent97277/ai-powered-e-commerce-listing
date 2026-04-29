'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RegenerateButton } from './RegenerateButton';
import { Store, CheckCircle2, FileText } from 'lucide-react';

export function ProductHeader({ title, status, productId }: { title: string; status: 'draft' | 'published'; productId: string }) {
  const isPublished = status === 'published';

  return (
    <header className="flex flex-col gap-6 border-b pb-8 lg:flex-row lg:items-end lg:justify-between"
      style={{
        borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
      }}
    >
      <div className="min-w-0 flex-1 space-y-4">
        {/* Status badge — 用品牌色 */}
        <div className="flex items-center gap-3">
          <Badge
            className="inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-medium tracking-wide"
            style={{
              backgroundColor: isPublished
                ? 'var(--brand-primary)'
                : 'color-mix(in srgb, var(--brand-primary) 8%, transparent)',
              borderColor: isPublished
                ? 'var(--brand-primary)'
                : 'color-mix(in srgb, var(--brand-primary) 32%, transparent)',
              color: isPublished
                ? 'var(--brand-bg)'
                : 'var(--brand-primary)',
              borderRadius: 'var(--brand-radius)',
              boxShadow: isPublished
                ? '0 4px 12px -2px color-mix(in srgb, var(--brand-primary) 40%, transparent)'
                : 'none',
            }}
          >
            {isPublished ? (
              <CheckCircle2 className="h-3 w-3" strokeWidth={2.6} />
            ) : (
              <FileText className="h-3 w-3" strokeWidth={2.4} />
            )}
            {isPublished ? '已上架' : '草稿'}
          </Badge>
          <span
            className="t-caption"
            style={{ color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)' }}
          >
            ID · {productId.slice(0, 8)}
          </span>
        </div>

        {/* Display title */}
        <h1
          className="t-h1 break-words"
          style={{
            fontFamily: 'var(--brand-font-heading)',
            color: 'var(--brand-text)',
          }}
        >
          {title}
        </h1>
      </div>

      {/* Action buttons group */}
      <div
        className="flex shrink-0 items-center gap-2 rounded-md p-1"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, transparent)',
          border: '1px solid color-mix(in srgb, var(--brand-primary) 12%, transparent)',
          borderRadius: 'calc(var(--brand-radius) + 2px)',
        }}
      >
        <RegenerateButton productId={productId} />
        <span
          className="h-6 w-px"
          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-primary) 18%, transparent)' }}
        />
        <Button
          className="hover-lift inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
          style={{
            backgroundColor: 'var(--brand-primary)',
            color: 'var(--brand-bg)',
            borderRadius: 'var(--brand-radius)',
            boxShadow: 'var(--elev-2)',
          }}
        >
          <Store className="h-4 w-4" strokeWidth={2.2} />
          上架到蝦皮
        </Button>
      </div>
    </header>
  );
}
