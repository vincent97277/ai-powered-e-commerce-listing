'use client';

/**
 * ThemeProvider — applies merchant theme vars to :root (V2 task 105 simplified)
 *
 * V1.7 D2 had a switcher with `setCurrentId` that wrote `demo-merchant-id` cookie
 * client-side. V2 per-merchant auth removed the switcher (one store at a time). The
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
  /** Current merchant id (cookie value) */
  currentId: string;
  /** Current merchant — V2: always exactly one (logged-in) */
  merchants: MerchantInfo[];
  /** Full meta for current merchant */
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
  // Why: after settings save → router.refresh() finishes the layout pass with new themeVars,
  // `current` is a new object ref (find() runs on a new array) — but with the V2.1 preset
  // dropdown, the form changes 5 fields at once, and the ref keeps changing across re-renders.
  // Serializing deps via JSON ensures setProperty only fires when real values change — avoids
  // thrash and guarantees save → refresh applies immediately.
  const themeKey = JSON.stringify(current.themeVars ?? FALLBACK_THEME);
  useEffect(() => {
    const theme = current.themeVars ?? FALLBACK_THEME;
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- themeKey already captures every themeVars field
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
