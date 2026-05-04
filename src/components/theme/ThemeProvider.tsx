'use client';

/**
 * ThemeProvider — applies merchant theme vars to :root (V2 task 105 simplified)
 *
 * V1.7 D2 had a switcher with `setCurrentId` that wrote `demo-merchant-id` cookie
 * client-side. V2 per-merchant auth removed the switcher (一次只進一家店). The
 * `merchants` array now contains exactly one merchant — current logged-in one —
 * passed from (merchant)/layout.tsx. Provider is now mostly an effect that
 * paints CSS vars + a no-op Ctx for backwards-compat with consumers that read
 * `current` (e.g. components that need the brand-emoji / tagline).
 *
 * Removed: setCurrentId (no longer needed; logout is the only "switch").
 */
import { createContext, useContext, useEffect, type ReactNode } from 'react';

export type MerchantInfo = {
  id: string;
  slug: string;
  name: string;
  emoji?: string;
  tagline?: string;
  themeVars: Record<string, string>;
};

type Ctx = {
  /** 當前 merchant id (cookie 值) */
  currentId: string;
  /** 當前 merchant — V2: 永遠只有一個 (logged-in) */
  merchants: MerchantInfo[];
  /** 取當前 merchant 完整 meta */
  current: MerchantInfo;
};

const ThemeCtx = createContext<Ctx | null>(null);

const FALLBACK_THEME = {
  '--brand-primary': '#1F2937',
  '--brand-bg': '#FAFAFA',
  '--brand-text': '#111827',
  '--brand-radius': '6px',
  '--brand-font-heading': "'Noto Sans TC', sans-serif",
};

const FALLBACK_MERCHANT: MerchantInfo = {
  id: '',
  slug: 'unknown',
  name: '未知商家',
  emoji: '🏪',
  themeVars: FALLBACK_THEME,
};

export function ThemeProvider({
  merchants,
  initialMerchantId,
  children,
}: {
  merchants: MerchantInfo[];
  initialMerchantId: string;
  children: ReactNode;
}) {
  const current =
    merchants.find((m) => m.id === initialMerchantId) ?? merchants[0] ?? FALLBACK_MERCHANT;

  // V2.1 — depend on serialized themeVars values, not the `current` object reference.
  // 為什麼: settings save → router.refresh() 走完 layout 拿到新 themeVars 後, `current`
  // 是新 object ref (find() 在新 array 上跑) — 但 V2.1 加 preset dropdown 後 form
  // 一次改 5 個欄位, 多次 re-render 之間 ref 一直變. 用 JSON 序列化 deps 確保只在
  // 真實 value 變動時才呼叫 setProperty, 避免 thrash + 確保 save → refresh 後立刻套用.
  const themeKey = JSON.stringify(current.themeVars ?? FALLBACK_THEME);
  useEffect(() => {
    const theme = current.themeVars ?? FALLBACK_THEME;
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- themeKey 已經 capture themeVars 全部欄位
  }, [themeKey]);

  return (
    <ThemeCtx.Provider value={{ currentId: initialMerchantId, merchants, current }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
