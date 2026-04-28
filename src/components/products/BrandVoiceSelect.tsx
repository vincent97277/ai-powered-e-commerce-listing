'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { BrandVoice } from '@/lib/types';

const VOICES: { value: BrandVoice; label: string; hint: string }[] = [
  { value: 'minimal', label: '極簡冷靜', hint: '日系選物・職人感' },
  { value: 'warm', label: '溫暖親切', hint: '在地小店・手作感' },
  { value: 'playful', label: '活潑趣味', hint: '夜市美食・年輕族群' },
  { value: 'luxury', label: '質感精品', hint: '高端禮品・送禮自用' },
];

export function BrandVoiceSelect({ value, onChange }: { value: BrandVoice; onChange: (v: BrandVoice) => void }) {
  return (
    <div className="space-y-2">
      <Label style={{ fontFamily: 'var(--brand-font-heading)' }}>商家風格</Label>
      <Select value={value} onValueChange={(v) => onChange(v as BrandVoice)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {VOICES.map((v) => (
            <SelectItem key={v.value} value={v.value}>
              <div className="flex flex-col">
                <span>{v.label}</span>
                <span className="text-xs opacity-60">{v.hint}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
