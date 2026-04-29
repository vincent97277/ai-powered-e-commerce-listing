/**
 * PlatformShell — Linear-tone wrapper for platform-level surfaces (V1 #47, RA5)
 *
 * 用法: 套在 admin / 平台首頁 / about / privacy / terms 等「不繼承商家品牌」 的 page
 * 機制: className="platform" → globals.css `.platform { ... }` 切換 brand vars 為 Linear-tone palette
 *       (見 #48 globals.css 修改)
 *
 * 不在 root layout 加, 因為 Next.js 不允許多個 root layout 改 <html>;
 * 改在 layout / page wrapper level 加 className 即可 (CSS var 透過 cascade 生效)
 *
 * Server component, 沒 client 互動.
 */
import type { ReactNode } from 'react';

export function PlatformShell({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`platform ${className}`.trim()}>{children}</div>;
}
