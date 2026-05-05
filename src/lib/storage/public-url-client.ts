/**
 * Client-safe public URL constructor for product images.
 *
 * V2.2.13: V2.2.4 introduced the R2 storage backend but left the frontend
 * components hardcoded to `/uploads/${r2Key}` — that path only resolves on
 * the local-fs backend (Next.js serves from public/uploads/). On R2 the
 * actual URL is `${R2_PUBLIC_URL}/${r2Key}`, an absolute Cloudflare URL.
 *
 * Why a separate util from @/lib/storage's getPublicUrl:
 * - getPublicUrl uses R2_PUBLIC_URL (server-only env var, NOT exposed to
 *   client bundles)
 * - Client React components need an env var with the NEXT_PUBLIC_ prefix
 *   so Next.js inlines it into the bundle
 * - Operator must set BOTH R2_PUBLIC_URL and NEXT_PUBLIC_R2_PUBLIC_URL
 *   to the same value in production (DEPLOY.md C.3 + .env.local.example)
 *
 * Backward-compat: when NEXT_PUBLIC_R2_PUBLIC_URL is unset (local dev with
 * STORAGE_BACKEND=local), falls back to the relative `/uploads/...` path
 * that Next.js serves from public/. So this util works on both backends.
 */
export function imageUrlFor(r2Key: string | null | undefined): string {
  if (!r2Key) return '';
  // V2 fixture marker (V1 demo data): keep /fixtures/* path intact
  if (r2Key.includes('/fixtures/')) return `/uploads/${r2Key}`;
  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;
  if (r2PublicUrl) {
    return `${r2PublicUrl.replace(/\/$/, '')}/${r2Key}`;
  }
  // local-fs backend (dev): Next.js serves /public/uploads/
  return `/uploads/${r2Key}`;
}
