'use client';

/**
 * MerchantSwitcher — header dropdown for switching merchants (V1.7 D2 rewrite)
 *
 * 為什麼改: V1 ~ V1.6 是 "SELECT all merchants → render <Select>" demo grade.
 * >50 商家後 DOM 爆炸 + 沒搜尋 + 沒分頁 → 不可用.
 *
 * V1.7 D2 行為:
 *   - layout.tsx 預載 top 10 most recently active merchants + totalCount
 *   - 下拉顯示: search input + top 10 list + "查看全部 →" link (totalCount > 10 才出)
 *   - typing 在 top 10 內 client-side filter; 0 命中 + total > 10 → "在已載入清單找不到, 查看全部 →"
 *   - ESC / click outside 關 (跟 ExportDropdown V1.5 同 pattern)
 *   - 切 merchant: 沿用 ThemeProvider.setCurrentId (寫 cookie + router.refresh)
 *   - Mobile <sm: dropdown 接近全螢幕, search input min-h-[44px] (B1 spirit + 44px touch target)
 */

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useTheme } from './ThemeProvider';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ChevronsUpDown, Loader2, Plus, Search, X } from 'lucide-react';
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

type MerchantLite = { id: string; slug: string; name: string };

type Props = {
  current: MerchantLite;
  /** layout.tsx 已預載: 最多 10 個 most recently active approved merchants */
  topMerchants: MerchantLite[];
  /** 平台 approved 商家總數 — 決定是否顯示「查看全部」link */
  totalCount: number;
};

export function MerchantSwitcher({ current, topMerchants, totalCount }: Props) {
  const { merchants, setCurrentId } = useTheme();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [sweep, setSweep] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ESC / 點外面 → 關 (copy from ExportDropdown V1.5 pattern)
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  // open 時 autofocus search input (好讓 power user 直接 type)
  useEffect(() => {
    if (open) {
      // 等 transition 完 (avoid scroll jump)
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
    }
  }, [open]);

  // Client-side filter (top 10 only; 完整搜尋走 /merchant-switcher 頁)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topMerchants;
    return topMerchants.filter(
      (m) => m.name.toLowerCase().includes(q) || m.slug.toLowerCase().includes(q),
    );
  }, [query, topMerchants]);

  function handleChange(id: string) {
    if (id === current.id) {
      setOpen(false);
      return;
    }
    // 先試 topMerchants (faster), 否則 fallback ThemeProvider.merchants (含 current)
    const next =
      topMerchants.find((m) => m.id === id) ?? merchants.find((m) => m.id === id);
    if (!next) return;
    setSweep(true);
    setTimeout(() => setSweep(false), 760);
    setCurrentId(id);
    setOpen(false);
    startTransition(() => router.refresh());
    const themeMatch = merchants.find((m) => m.id === id);
    toast(`切換到「${next.name}」`, {
      icon: themeMatch?.emoji ?? emojiFor(next.name),
      description: themeMatch?.tagline,
      duration: 3000,
      style: { borderLeft: '3px solid var(--brand-primary)' },
    });
  }

  const currentTheme = merchants.find((m) => m.id === current.id);
  const currentEmoji = currentTheme?.emoji ?? emojiFor(current.name);
  const showViewAllLink = totalCount > topMerchants.length;
  const noMatchInTop = query.trim().length > 0 && filtered.length === 0;

  return (
    <div
      ref={containerRef}
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

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="切換商家"
        className="flex h-auto items-center gap-2 border-0 bg-transparent px-1 py-0.5 text-left outline-none focus:ring-0 focus-visible:ring-0"
        style={{ minWidth: '200px' }}
      >
        <div className="flex flex-col items-start leading-tight">
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
        <ChevronsUpDown
          className="ml-auto h-3.5 w-3.5 shrink-0 opacity-50"
          strokeWidth={2.2}
          style={{ color: 'var(--brand-primary)' }}
        />
      </button>

      {open && (
        <>
          {/* Mobile backdrop — 點 backdrop 關 + 視覺 dim, 桌面看不見 */}
          <div
            className="fixed inset-0 z-30 bg-black/40 sm:hidden"
            onClick={() => setOpen(false)}
            aria-hidden
          />

          <div
            role="listbox"
            aria-label="商家列表"
            className="
              fixed left-0 right-0 top-0 z-40 max-h-[100dvh] overflow-y-auto
              sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-1
              sm:max-h-[60vh] sm:w-[320px]
              elev-3
            "
            style={{
              backgroundColor: 'var(--brand-bg)',
              border: '1px solid color-mix(in srgb, var(--brand-primary) 22%, transparent)',
              borderRadius: 'calc(var(--brand-radius) + 4px)',
              boxShadow: 'var(--elev-3)',
            }}
          >
            {/* Search header */}
            <div
              className="sticky top-0 flex items-center gap-2 border-b px-3 py-2"
              style={{
                backgroundColor: 'var(--brand-bg)',
                borderColor: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
              }}
            >
              <Search
                className="h-4 w-4 shrink-0 opacity-50"
                strokeWidth={2.2}
                style={{ color: 'var(--brand-primary)' }}
                aria-hidden
              />
              <input
                ref={inputRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.currentTarget.value)}
                placeholder="搜尋商家…"
                aria-label="搜尋已載入商家"
                className="w-full border-0 bg-transparent text-sm outline-none placeholder:opacity-40"
                style={{
                  color: 'var(--brand-text)',
                  minHeight: '44px',
                }}
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="關閉"
                className="rounded p-1 sm:hidden"
                style={{ minHeight: '44px', minWidth: '44px' }}
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>

            {/* List */}
            <div className="py-1">
              {filtered.map((m) => {
                const e = emojiFor(m.name);
                const selected = m.id === current.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={selected}
                    onClick={() => handleChange(m.id)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition hover:bg-brand-soft"
                    style={{
                      backgroundColor: selected
                        ? 'color-mix(in srgb, var(--brand-primary) 10%, transparent)'
                        : undefined,
                      borderRadius: 'var(--brand-radius)',
                      minHeight: '44px',
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
                      <span
                        className="text-xs truncate max-w-[240px] font-mono"
                        style={{
                          color: 'color-mix(in srgb, var(--brand-text) 45%, transparent)',
                        }}
                      >
                        {m.slug}
                      </span>
                    </div>
                  </button>
                );
              })}

              {/* No-match hint — only when totalCount > topMerchants */}
              {noMatchInTop && (
                <div
                  className="px-3 py-3 text-xs"
                  style={{
                    color: 'color-mix(in srgb, var(--brand-text) 60%, transparent)',
                  }}
                >
                  {showViewAllLink ? (
                    <>
                      在已載入清單找不到「{query}」.{' '}
                      <Link
                        href={`/merchant-switcher?q=${encodeURIComponent(query)}`}
                        className="underline-offset-2 hover:underline"
                        style={{ color: 'var(--brand-primary)' }}
                      >
                        查看全部 →
                      </Link>
                    </>
                  ) : (
                    <>找不到「{query}」.</>
                  )}
                </div>
              )}
            </div>

            {/* Footer: view all + onboarding */}
            <div
              className="border-t"
              style={{
                borderColor: 'color-mix(in srgb, var(--brand-primary) 14%, transparent)',
              }}
            >
              {showViewAllLink && (
                <Link
                  href="/merchant-switcher"
                  className="flex items-center justify-between px-3 py-2 text-sm hover:bg-brand-soft"
                  style={{
                    color: 'var(--brand-primary)',
                    minHeight: '44px',
                  }}
                  onClick={() => setOpen(false)}
                >
                  <span>查看全部 ({totalCount})</span>
                  <span aria-hidden>→</span>
                </Link>
              )}
              <Link
                href="/onboarding"
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-brand-soft"
                style={{
                  color: 'var(--brand-primary)',
                  minHeight: '44px',
                }}
                onClick={() => setOpen(false)}
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.2} />
                開新店面
              </Link>
            </div>
          </div>
        </>
      )}

      {isPending && (
        <span className="inline-flex items-center gap-1 pr-1 text-xs opacity-60">
          <Loader2 className="h-3 w-3 animate-spin" />
        </span>
      )}

      {sweep && <div className="whimsy-sweep-overlay" aria-hidden />}
    </div>
  );
}
