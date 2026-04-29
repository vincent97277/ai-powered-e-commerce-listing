'use client';

import { useEffect } from 'react';

/**
 * Storefront 用的 theme provider — 把該商家的 5 個 CSS vars 注入 :root
 * 跟 (merchant) 那個 ThemeProvider 不同, 這個是 server-resolved 寫死, 不能切換
 */
export function ThemeProviderForStore({
  themeVars,
  children,
}: {
  themeVars: Record<string, string>;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const root = document.documentElement;
    const prev: Record<string, string> = {};
    Object.entries(themeVars).forEach(([k, v]) => {
      prev[k] = root.style.getPropertyValue(k);
      root.style.setProperty(k, v);
    });
    return () => {
      Object.entries(prev).forEach(([k, v]) => {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      });
    };
  }, [themeVars]);

  return <>{children}</>;
}
