/**
 * (admin) route group layout — wraps every /admin/* page with PlatformShell
 * (V1 #49, RA5)
 *
 * V1.6 E11 (Codex Eng review): Second-gate DB session validation.
 *   middleware.ts only checks HMAC signature on the cookie (Edge runtime, no DB).
 *   That means a revoked admin_sessions row still passes the gate.
 *   This server-component layout runs on every /admin/* route load (Node runtime),
 *   so we re-validate against the DB here. Revoked / expired / missing-row → redirect
 *   to /admin/login. middleware HMAC check stays as the cheap first gate.
 */
import type { ReactNode } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PlatformShell } from '@/components/platform/PlatformShell';
import { ADMIN_SESSION_COOKIE, validateAdminSession } from '@/lib/admin-session';

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // 二段檢查 (middleware 已過 HMAC, 這裡查 DB session 仍存活)
  const c = await cookies();
  const cookieValue = c.get(ADMIN_SESSION_COOKIE)?.value;
  const sessionId = await validateAdminSession(cookieValue);
  if (!sessionId) {
    // session 被 revoke / 過期 / DB row 不見 → 回 login
    // 與 middleware 一致: 帶 next=/admin (layout 拿不到 pathname, 用 admin root 當 fallback)
    redirect('/admin/login?next=%2Fadmin');
  }

  return <PlatformShell className="min-h-screen">{children}</PlatformShell>;
}
