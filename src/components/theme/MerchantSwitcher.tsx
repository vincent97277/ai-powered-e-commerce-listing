'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from './ThemeProvider';
import { MERCHANT_META, type MerchantId } from '@/lib/themes';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function MerchantSwitcher() {
  const { merchantId, setMerchantId } = useTheme();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const meta = MERCHANT_META[merchantId];

  const handleChange = (id: MerchantId) => {
    setMerchantId(id);
    startTransition(() => router.refresh());
  };

  return (
    <div className="flex items-center gap-3">
      <Avatar className="h-9 w-9 ring-2 transition-all" style={{ borderColor: 'var(--brand-primary)' }}>
        <AvatarFallback style={{ backgroundColor: 'var(--brand-primary)', color: 'var(--brand-bg)' }}>
          {meta.emoji}
        </AvatarFallback>
      </Avatar>
      <Select value={merchantId} onValueChange={(v) => handleChange(v as MerchantId)}>
        <SelectTrigger className="w-[180px] border-[var(--brand-primary)]/30">
          <SelectValue>
            <span style={{ fontFamily: 'var(--brand-font-heading)' }}>{meta.name}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(MERCHANT_META) as MerchantId[]).map((id) => (
            <SelectItem key={id} value={id}>
              <span className="mr-2">{MERCHANT_META[id].emoji}</span>
              {MERCHANT_META[id].name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && <span className="text-xs opacity-50">切換中…</span>}
    </div>
  );
}
