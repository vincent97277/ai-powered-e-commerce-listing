'use client';

import { Badge } from '@/components/ui/badge';
import { useState } from 'react';
import { Hash } from 'lucide-react';

export function TagsChips({ tags }: { tags: string[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <Hash
          className="h-3.5 w-3.5"
          strokeWidth={2.2}
          style={{ color: 'var(--brand-primary)', opacity: 0.7 }}
        />
        <h2 className="t-caption" style={{ color: 'var(--brand-primary)' }}>
          SEO 標籤
        </h2>
        <span
          className="t-caption tabular-nums"
          style={{ color: 'color-mix(in srgb, var(--brand-text) 40%, transparent)' }}
        >
          · {tags.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        {tags.map((t, i) => {
          // Even index → outlined / odd → filled (alternating variants)
          const isFilled = i % 2 === 1;
          const isActive = activeIndex === i;

          return (
            <Badge
              key={t}
              variant="outline"
              className="hover-lift cursor-default border px-3 py-1 text-xs font-medium"
              onMouseEnter={() => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}
              style={{
                backgroundColor: isFilled
                  ? 'color-mix(in srgb, var(--brand-primary) 14%, transparent)'
                  : isActive
                    ? 'color-mix(in srgb, var(--brand-primary) 8%, transparent)'
                    : 'transparent',
                borderColor: isFilled
                  ? 'color-mix(in srgb, var(--brand-primary) 28%, transparent)'
                  : 'color-mix(in srgb, var(--brand-primary) 36%, transparent)',
                color: 'var(--brand-primary)',
                borderRadius: 'var(--brand-radius)',
                boxShadow: isActive
                  ? '0 2px 8px -2px color-mix(in srgb, var(--brand-primary) 30%, transparent)'
                  : 'none',
              }}
            >
              <span className="opacity-50">#</span>
              {t}
            </Badge>
          );
        })}
      </div>
    </section>
  );
}
