'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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
  /** 所有可選的 merchant (從 DB 撈) */
  merchants: MerchantInfo[];
  /** 取當前 merchant 完整 meta */
  current: MerchantInfo;
  /** 切換 merchant */
  setCurrentId: (id: string) => void;
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
  const [currentId, setCurrentIdState] = useState<string>(initialMerchantId);

  const current =
    merchants.find((m) => m.id === currentId) ?? merchants[0] ?? FALLBACK_MERCHANT;

  useEffect(() => {
    const theme = current.themeVars ?? FALLBACK_THEME;
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [current]);

  const setCurrentId = (id: string) => {
    document.cookie = `demo-merchant-id=${id}; path=/; max-age=31536000`;
    setCurrentIdState(id);
  };

  return (
    <ThemeCtx.Provider value={{ currentId, merchants, current, setCurrentId }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
