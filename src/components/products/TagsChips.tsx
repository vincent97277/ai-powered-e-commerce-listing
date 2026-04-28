'use client';

import { Badge } from '@/components/ui/badge';

export function TagsChips({ tags }: { tags: string[] }) {
  return (
    <section className="space-y-3">
      <h2 className="text-sm uppercase tracking-wider opacity-60">SEO 標籤</h2>
      <div className="flex flex-wrap gap-2">
        {tags.map((t) => (
          <Badge key={t} variant="outline" style={{
            borderColor: 'var(--brand-primary)',
            color: 'var(--brand-primary)',
            borderRadius: 'var(--brand-radius)',
          }}>
            #{t}
          </Badge>
        ))}
      </div>
    </section>
  );
}
