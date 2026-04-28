'use client';

import { Card } from '@/components/ui/card';

export function PriceCard({ min, max, confidence }: { min: number; max: number; confidence: number }) {
  const mid = Math.round((min + max) / 2);
  return (
    <Card className="space-y-4 p-6"
      style={{ borderRadius: 'var(--brand-radius)', borderColor: 'var(--brand-primary)' }}>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm uppercase tracking-wider opacity-60">建議定價</h2>
        <span className="text-xs opacity-60">信心 {(confidence * 100).toFixed(0)}%</span>
      </div>
      <p className="text-4xl font-semibold"
        style={{ color: 'var(--brand-primary)', fontFamily: 'var(--brand-font-heading)' }}>
        NT$ {min.toLocaleString()} – {max.toLocaleString()}
      </p>
      <div className="space-y-1">
        <div className="relative h-2 rounded-full" style={{ backgroundColor: 'var(--brand-primary)' + '20' }}>
          <div className="absolute top-0 h-2 rounded-full"
            style={{ left: '20%', width: '60%', backgroundColor: 'var(--brand-primary)' }} />
          <div className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 bg-white"
            style={{ left: 'calc(50% - 8px)', borderColor: 'var(--brand-primary)' }} />
        </div>
        <div className="flex justify-between text-xs opacity-60">
          <span>NT$ {min}</span>
          <span>建議 NT$ {mid}</span>
          <span>NT$ {max}</span>
        </div>
      </div>
    </Card>
  );
}
