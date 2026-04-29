'use server';

/**
 * Admin login server action (V1 #45)
 * - constant-time password compare
 * - 對則建 admin_sessions row + set HttpOnly Secure SameSite=Strict cookie
 * - inline error 不出 toast (避免 timing leak)
 */
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_DURATION_MS,
  createAdminSession,
  verifyAdminPassword,
} from '@/lib/admin-session';

export type LoginState = { error?: string } | undefined;

export async function loginAction(prevState: LoginState, formData: FormData): Promise<LoginState> {
  const password = formData.get('password');
  const next = formData.get('next');
  const nextPath = typeof next === 'string' && next.startsWith('/admin') ? next : '/admin';

  if (typeof password !== 'string' || password.length === 0) {
    return { error: '密碼錯誤' };
  }
  if (!verifyAdminPassword(password)) {
    // 故意不分「密碼錯誤」「沒設密碼」, 統一錯誤訊息
    return { error: '密碼錯誤' };
  }

  // 建 session
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const userAgent = h.get('user-agent') ?? null;
  const { cookieValue, expiresAt } = await createAdminSession({
    ip: ip ?? undefined,
    userAgent: userAgent ?? undefined,
  });

  const c = await cookies();
  c.set(ADMIN_SESSION_COOKIE, cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/admin',
    expires: expiresAt,
    maxAge: Math.floor(ADMIN_SESSION_DURATION_MS / 1000),
  });

  redirect(nextPath);
}
