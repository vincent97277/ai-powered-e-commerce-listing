/**
 * Admin session 純 crypto helpers (Edge-runtime safe, 不 import drizzle/pg)
 *
 * middleware.ts 只能跑 Edge runtime, 不能查 DB
 * 所以 middleware 只做 HMAC 簽章 check (pure crypto)
 * 真正的 session 存活檢查 (admin_sessions row 存在 + 未過期) 在 server component 內做
 */

export const ADMIN_SESSION_COOKIE = 'admin-session';

/** 用 Web Crypto API (Edge-compat) 算 HMAC-SHA256 */
async function hmacSha256(secret: string, data: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time hex string compare (Edge-compat, 自己 loop) */
function timingSafeHexEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 驗 cookie value 簽章 (HMAC). 不查 DB.
 * 回 sessionId 或 null
 */
export async function verifyCookieSignatureEdge(
  cookieValue: string | undefined,
  secret: string | undefined,
): Promise<string | null> {
  if (!cookieValue || !secret || secret.length < 32) return null;
  const dot = cookieValue.indexOf('.');
  if (dot < 0) return null;
  const sessionId = cookieValue.slice(0, dot);
  const providedMac = cookieValue.slice(dot + 1);
  if (!sessionId || !providedMac) return null;
  const expected = await hmacSha256(secret, sessionId);
  return timingSafeHexEq(providedMac, expected) ? sessionId : null;
}
