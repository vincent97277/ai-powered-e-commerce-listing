/**
 * V2 merchant-session 純 crypto helpers (Edge-runtime safe, 不 import drizzle/pg).
 *
 * middleware.ts 只能跑 Edge runtime → 不能 import dbAdmin → 只做 HMAC 簽章 check.
 * 真正的 row liveness (DB exists + not expired + not revoked) 在 server component
 * (e.g. `(merchant)/layout.tsx` task 105) 用 validateMerchantSession 做.
 *
 * 跟 admin-session-edge 同 shape: secret 是參數 (middleware 已從 process.env 撈過再 pass 進來).
 */

export const MERCHANT_SESSION_COOKIE = 'merchant-session';

/** 用 Web Crypto API (Edge-compat) 算 HMAC-SHA256, 回 hex string */
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

/** Constant-time hex string compare (Edge-compat 自己 loop, timingSafeEqual 在 Edge 沒) */
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
 * 回 sessionId 或 null. 使用者已 revoked / DB row 過期等情境會在後續 layout-level
 * `validateMerchantSession()` 擋下 — middleware 只擋掉「沒 cookie / 簽章爛掉」.
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
  if (!sessionId || providedMac.length !== 64) return null; // SHA-256 hex = 64 chars

  let expected: string;
  try {
    expected = await hmacSha256(secret, sessionId);
  } catch {
    return null;
  }
  return timingSafeHexEq(providedMac, expected) ? sessionId : null;
}
