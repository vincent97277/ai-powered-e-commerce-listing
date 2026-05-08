/**
 * V2 merchant-session pure crypto helpers (Edge-runtime safe, no drizzle/pg imports).
 *
 * middleware.ts only runs in Edge runtime → can't import dbAdmin → HMAC signature check only.
 * Actual row liveness (DB exists + not expired + not revoked) is enforced in server components
 * (e.g. `(merchant)/layout.tsx` task 105) via validateMerchantSession.
 *
 * Same shape as admin-session-edge: secret is a parameter (middleware reads it from
 * process.env and passes it in).
 */

export const MERCHANT_SESSION_COOKIE = 'merchant-session';

/** Compute HMAC-SHA256 via Web Crypto API (Edge-compat); returns a hex string. */
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

/** Constant-time hex string compare (Edge-compat hand-rolled loop; timingSafeEqual unavailable in Edge). */
function timingSafeHexEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify cookie value signature (HMAC). No DB lookup.
 * Returns sessionId or null. Cases like user revoked / DB row expired are caught later
 * by layout-level `validateMerchantSession()` — middleware only blocks "missing cookie /
 * busted signature".
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
