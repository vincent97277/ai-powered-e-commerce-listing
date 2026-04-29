'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles } from 'lucide-react';
import type { BrandVoice } from '@/lib/types';

const VOICES: { value: BrandVoice; label: string; hint: string }[] = [
  { value: 'minimal', label: '簡約日系', hint: '短句、留白、不堆形容詞' },
  { value: 'warm', label: '溫暖手作', hint: '有故事感、像在跟朋友介紹' },
  { value: 'playful', label: '夜市嘴砲', hint: '口語、有梗、敢用驚嘆號' },
  { value: 'luxury', label: '精品質感', hint: '慢節奏、講工藝、不討好' },
];

export function BrandVoiceSelect({ value, onChange }: { value: BrandVoice; onChange: (v: BrandVoice) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <Sparkles
          className="h-3.5 w-3.5"
          strokeWidth={2.4}
          style={{ color: 'var(--brand-primary)', opacity: 0.8 }}
        />
        <Label
          className="t-caption"
          style={{
            color: 'var(--brand-primary)',
            fontFamily: 'var(--brand-font-heading)',
          }}
        >
          用誰的口氣寫
        </Label>
      </div>
      <Select value={value} onValueChange={(v) => onChange(v as BrandVoice)}>
        <SelectTrigger
          className="h-auto py-3"
          style={{
            borderColor: 'color-mix(in srgb, var(--brand-primary) 28%, transparent)',
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 3%, var(--brand-bg))',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          style={{
            backgroundColor: 'var(--brand-bg)',
            borderColor: 'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            borderRadius: 'calc(var(--brand-radius) + 4px)',
            boxShadow: 'var(--elev-3)',
          }}
        >
          {VOICES.map((v) => (
            <SelectItem
              key={v.value}
              value={v.value}
              className="py-2.5"
              style={{ borderRadius: 'var(--brand-radius)' }}
            >
              <div className="flex flex-col gap-0.5">
                <span className="font-medium" style={{ color: 'var(--brand-text)' }}>
                  {v.label}
                </span>
                <span
                  className="text-xs"
                  style={{ color: 'color-mix(in srgb, var(--brand-text) 55%, transparent)' }}
                >
                  {v.hint}
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
