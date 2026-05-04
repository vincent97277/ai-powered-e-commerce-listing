/**
 * /merchant/logout — POST handler (V2 task 104, 105 finalized)
 *
 * 為什麼是 route 不是 server action: 從 layout header 的 logout button 用 <form> POST
 * 直接觸發, 不需要 client-side hydration 也能 work. 純 server-rendered, no JS required.
 *
 * 行為:
 *   1. 讀 merchant-session cookie → verify HMAC → revoke DB row (revoked_at = now())
 *   2. clear merchant-session cookie
 *   3. 303 → /merchant/login
 *
 * Idempotent: 沒 cookie / 簽章爛掉 / DB row 已 revoke → 仍然清 cookie + redirect, 不報錯.
 *
 * 安全: revoke 必須 hit DB — 純清 cookie 不夠. 若 attacker 在另一台裝置撈到 cookie value,
 *      revoke 會把 DB row 標 revoked_at, validateMerchantSession 立刻擋下.
 *
 * V2 task 105: 不再清 demo-merchant-id 過渡 cookie (login 也不再 set 它).
 */
import { NextResponse, type NextRequest } from 'next/server';
import {
  MERCHANT_SESSION_COOKIE,
  revokeMerchantSession,
  verifyCookieSignature,
} from '@/lib/merchant-session';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const cookieValue = req.cookies.get(MERCHANT_SESSION_COOKIE)?.value;

  // 簽章合法 → 撈 sessionId → revoke DB row. 簽章爛掉就直接跳 (clear cookie 即可).
  if (cookieValue) {
    const sessionId = verifyCookieSignature(cookieValue);
    if (sessionId) {
      try {
        await revokeMerchantSession(sessionId);
      } catch (err) {
        // revoke 寫不進去也不能擋掉登出流程 (e.g. DB hiccup); log + 繼續 clear cookie.
        console.error('[merchant/logout] revoke failed', err);
      }
    }
  }

  const url = req.nextUrl.clone();
  url.pathname = '/merchant/login';
  url.search = '';
  const res = NextResponse.redirect(url, 303); // 303 see-other: POST → GET semantic

  res.cookies.set(MERCHANT_SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
    maxAge: 0,
  });

  return res;
}

// GET → method-not-allowed (logout 必須 POST 防 CSRF / prefetch-as-logout)
export async function GET() {
  return new NextResponse('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
}
