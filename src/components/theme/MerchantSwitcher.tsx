'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from './ThemeProvider';
import { MERCHANT_META, type MerchantId } from '@/lib/themes';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronsUpDown, Loader2 } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';

export function MerchantSwitcher() {
  const { merchantId, setMerchantId } = useTheme();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sweep, setSweep] = useState(false);
  const meta = MERCHANT_META[merchantId];

  const handleChange = (id: MerchantId) => {
    if (id === merchantId) return;
    const nextMeta = MERCHANT_META[id];
    // 1) sweep overlay (~720ms)
    setSweep(true);
    setTimeout(() => setSweep(false), 760);
    // 2) update theme + refresh
    setMerchantId(id);
    startTransition(() => router.refresh());
    // 3) brand-color toast (theme 已切，toast 內 var 自動著色)
    toast(`換上${nextMeta.name}的口氣`, {
      icon: nextMeta.emoji,
      description: nextMeta.tagline,
      duration: 3000,
      style: { borderLeft: '3px solid var(--brand-primary)' },
    });
  };

  return (
    <div
      className="relative inline-flex items-center gap-2.5 rounded-md border p-1 pr-2"
      style={{
        backgroundColor:
          'color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg))',
        borderColor:
          'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
        borderRadius: 'calc(var(--brand-radius) + 4px)',
        boxShadow: 'var(--elev-1)',
      }}
    >
      {/* Avatar with brand glow ring + flip transition */}
      <AnimatePresence mode="wait">
        <motion.div
          key={merchantId}
          initial={{ rotateY: 90, scale: 0.7, opacity: 0 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          exit={{ rotateY: -90, scale: 0.7, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          style={{ transformStyle: 'preserve-3d' }}
          className="shrink-0"
        >
          <Avatar
            className="h-9 w-9"
            style={{
              boxShadow:
                '0 0 0 2px var(--brand-primary), 0 0 0 4px color-mix(in srgb, var(--brand-primary) 22%, transparent), 0 4px 12px -4px color-mix(in srgb, var(--brand-primary) 40%, transparent)',
              borderRadius: 'var(--brand-radius)',
            }}
          >
            <AvatarFallback
              className="text-base"
              style={{
                backgroundColor: 'var(--brand-primary)',
                color: 'var(--brand-bg)',
                borderRadius: 'var(--brand-radius)',
              }}
            >
              {meta.emoji}
            </AvatarFallback>
          </Avatar>
        </motion.div>
      </AnimatePresence>

      <Select
        value={merchantId}
        onValueChange={(v) => handleChange(v as MerchantId)}
      >
        <SelectTrigger
          className="h-auto w-[180px] gap-2 border-0 bg-transparent px-1 py-0.5 shadow-none focus:ring-0 focus-visible:ring-0"
          style={{ outline: 'none' }}
        >
          <SelectValue>
            <div className="flex flex-col items-start text-left leading-tight">
              <span
                className="t-caption"
                style={{
                  color:
                    'color-mix(in srgb, var(--brand-text) 50%, transparent)',
                  fontSize: '10px',
                }}
              >
                當前商家
              </span>
              <span
                className="text-sm font-semibold"
                style={{
                  fontFamily: 'var(--brand-font-heading)',
                  color: 'var(--brand-text)',
                }}
              >
                {meta.name}
              </span>
            </div>
          </SelectValue>
          <ChevronsUpDown
            className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50"
            strokeWidth={2.2}
            style={{ color: 'var(--brand-primary)' }}
          />
        </SelectTrigger>

        <SelectContent
          style={{
            borderColor:
              'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            backgroundColor: 'var(--brand-bg)',
            borderRadius: 'calc(var(--brand-radius) + 4px)',
            boxShadow: 'var(--elev-3)',
          }}
        >
          {(Object.keys(MERCHANT_META) as MerchantId[]).map((id) => {
            const m = MERCHANT_META[id];
            const selected = id === merchantId;
            return (
              <SelectItem
                key={id}
                value={id}
                className="gap-2.5 py-2 pr-8"
                style={{
                  backgroundColor: selected
                    ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                    : undefined,
                  borderRadius: 'var(--brand-radius)',
                }}
              >
                <span className="mr-1 text-lg">{m.emoji}</span>
                <div className="flex flex-col">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--brand-text)' }}
                  >
                    {m.name}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color:
                        'color-mix(in srgb, var(--brand-text) 55%, transparent)',
                    }}
                  >
                    {m.tagline}
                  </span>
                </div>
              </SelectItem>
            );
          })}
        </SelectContent>
      </Select>

      {isPending && (
        <span className="inline-flex items-center gap-1 pr-1 text-xs opacity-60">
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      )}

      {/* Brand color sweep overlay (儀式感) */}
      {sweep && <div className="whimsy-sweep-overlay" aria-hidden />}
    </div>
  );
}
