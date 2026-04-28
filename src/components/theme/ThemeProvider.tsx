'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { THEMES, type MerchantId } from '@/lib/themes';

type Ctx = { merchantId: MerchantId; setMerchantId: (id: MerchantId) => void };
const ThemeCtx = createContext<Ctx | null>(null);

export function ThemeProvider({
  initialMerchantId,
  children,
}: {
  initialMerchantId: MerchantId;
  children: ReactNode;
}) {
  const [merchantId, setMerchantIdState] = useState<MerchantId>(initialMerchantId);

  useEffect(() => {
    const theme = THEMES[merchantId];
    const root = document.documentElement;
    Object.entries(theme).forEach(([k, v]) => root.style.setProperty(k, v));
  }, [merchantId]);

  const setMerchantId = (id: MerchantId) => {
    document.cookie = `demo-merchant-id=${id}; path=/; max-age=31536000`;
    setMerchantIdState(id);
  };

  return <ThemeCtx.Provider value={{ merchantId, setMerchantId }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeCtx);
  if (!ctx) throw new Error('useTheme must be inside ThemeProvider');
  return ctx;
}
