/**
 * Storefront 用的 theme provider — 把該商家的 5 個 CSS vars 注入 :root
 * 跟 (merchant) 那個 ThemeProvider 不同, 這個是 server-resolved 寫死, 不能切換
 *
 * V2.1.x FOUC fix: server-render inline <style> 注入 themeVars, 第一次 paint 就用對的顏色.
 * 改成 server component (拿掉 'use client' + useEffect), 因為不需 client-side 行為.
 */
export function ThemeProviderForStore({
  themeVars,
  children,
}: {
  themeVars: Record<string, string>;
  children: React.ReactNode;
}) {
  const cssText = Object.entries(themeVars)
    .map(([k, v]) => `${k}: ${v};`)
    .join(' ');
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `:root { ${cssText} }` }} />
      {children}
    </>
  );
}
