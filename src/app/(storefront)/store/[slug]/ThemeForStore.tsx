/**
 * Theme provider for the storefront — injects this merchant's 5 CSS vars into :root.
 * Unlike the (merchant) ThemeProvider, this one is server-resolved and fixed; cannot be switched.
 *
 * V2.1.x FOUC fix: server-render an inline <style> injecting themeVars so the first paint
 * already uses the correct colors. Converted to a server component (dropped 'use client' +
 * useEffect) since no client-side behavior is needed.
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
