'use client';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTheme } from './ThemeProvider';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ChevronsUpDown, Loader2, Plus } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import Link from 'next/link';

/**
 * 從 merchant name 派一個固定 emoji (避免每次 render 隨機)
 */
function emojiFor(name: string): string {
  const pool = ['🍵', '🍗', '🛒', '🌿', '🎁', '🍰', '🧵', '🌸', '🍱', '🪴'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return pool[Math.abs(hash) % pool.length];
}

export function MerchantSwitcher() {
  const { current, merchants, setCurrentId } = useTheme();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sweep, setSweep] = useState(false);

  const handleChange = (id: string) => {
    if (id === current.id) return;
    const next = merchants.find((m) => m.id === id);
    if (!next) return;
    setSweep(true);
    setTimeout(() => setSweep(false), 760);
    setCurrentId(id);
    startTransition(() => router.refresh());
    toast(`切換到「${next.name}」`, {
      icon: next.emoji ?? emojiFor(next.name),
      description: next.tagline,
      duration: 3000,
      style: { borderLeft: '3px solid var(--brand-primary)' },
    });
  };

  const currentEmoji = current.emoji ?? emojiFor(current.name);

  return (
    <div
      className="relative inline-flex items-center gap-2.5 rounded-md border p-1 pr-2"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, var(--brand-bg))',
        borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
        borderRadius: 'calc(var(--brand-radius) + 4px)',
        boxShadow: 'var(--elev-1)',
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={current.id}
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
              {currentEmoji}
            </AvatarFallback>
          </Avatar>
        </motion.div>
      </AnimatePresence>

      <Select value={current.id} onValueChange={(v) => v && handleChange(v)}>
        <SelectTrigger
          className="h-auto w-[200px] gap-2 border-0 bg-transparent px-1 py-0.5 shadow-none focus:ring-0 focus-visible:ring-0"
          style={{ outline: 'none' }}
        >
          <SelectValue>
            <div className="flex flex-col items-start text-left leading-tight">
              <span
                className="t-caption"
                style={{
                  color: 'color-mix(in srgb, var(--brand-text) 50%, transparent)',
                  fontSize: '10px',
                }}
              >
                當前商家
              </span>
              <span
                className="text-sm font-semibold truncate max-w-[160px]"
                style={{
                  fontFamily: 'var(--brand-font-heading)',
                  color: 'var(--brand-text)',
                }}
              >
                {current.name}
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
            borderColor: 'color-mix(in srgb, var(--brand-primary) 22%, transparent)',
            backgroundColor: 'var(--brand-bg)',
            borderRadius: 'calc(var(--brand-radius) + 4px)',
            boxShadow: 'var(--elev-3)',
          }}
        >
          {merchants.map((m) => {
            const e = m.emoji ?? emojiFor(m.name);
            const selected = m.id === current.id;
            return (
              <SelectItem
                key={m.id}
                value={m.id}
                className="gap-2.5 py-2 pr-8"
                style={{
                  backgroundColor: selected
                    ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                    : undefined,
                  borderRadius: 'var(--brand-radius)',
                }}
              >
                <span className="mr-1 text-lg">{e}</span>
                <div className="flex flex-col">
                  <span
                    className="text-sm font-medium"
                    style={{ color: 'var(--brand-text)' }}
                  >
                    {m.name}
                  </span>
                  {m.tagline && (
                    <span
                      className="text-xs truncate max-w-[200px]"
                      style={{
                        color: 'color-mix(in srgb, var(--brand-text) 55%, transparent)',
                      }}
                    >
                      {m.tagline}
                    </span>
                  )}
                </div>
              </SelectItem>
            );
          })}
          {/* 開新店面入口 */}
          <Link
            href="/onboarding"
            className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-brand-soft border-t mt-1"
            style={{
              borderColor: 'color-mix(in srgb, var(--brand-primary) 16%, transparent)',
              color: 'var(--brand-primary)',
            }}
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.4} />
            開新店面
          </Link>
        </SelectContent>
      </Select>

      {isPending && (
        <span className="inline-flex items-center gap-1 pr-1 text-xs opacity-60">
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      )}

      {sweep && <div className="whimsy-sweep-overlay" aria-hidden />}
    </div>
  );
}
