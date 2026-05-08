/**
 * Admin session pure crypto helpers (Edge-runtime safe, no drizzle/pg imports)
 *
 * middleware.ts only runs in Edge runtime — can't hit DB.
 * So middleware does HMAC signature check only (pure crypto).
 * Actual session liveness check (admin_sessions row exists + not expired) is done in
 * server components.
 */

export const ADMIN_SESSION_COOKIE = 'admin-session';

/** Compute HMAC-SHA256 via Web Crypto API (Edge-compat). */
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

/** Constant-time hex string compare (Edge-compat, hand-rolled loop). */
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
 * Returns sessionId or null.
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
