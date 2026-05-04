/**
 * Next.js instrumentation hook — runs once per server process at boot.
 * V2.2.1 reason: validate environment variables at startup so a typo'd env
 * name is a boot failure, not a quiet 500 on the first user request.
 *
 * IMPORTANT (V2.2.10 / autoplan v2 F8): this runs at FUNCTION COLD START on
 * Vercel, NOT at deploy time. A bad env var means deploy succeeds, then every
 * cold lambda crashes, and Vercel serves 5xx until the env is fixed (Vercel
 * does NOT auto-rollback on runtime errors). Recovery: open Vercel dashboard
 * → Deployments → click ⋯ on a previous good deploy → "Promote to Production".
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Only validate on the actual server runtimes; the Edge runtime has a
  // narrower env shape and the build phase has no env at all.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  // V2.2.10 / autoplan v2 F4: Preview deployments must NOT touch prod R2.
  // Prod env vars are scoped to the Production environment in Vercel UI; if a
  // operator accidentally adds STORAGE_BACKEND=r2 to Preview/Dev scope, this
  // catches it at boot before any write hits the prod bucket.
  if (
    process.env.VERCEL_ENV === 'preview' &&
    process.env.STORAGE_BACKEND === 'r2'
  ) {
    const msg =
      '[env] PREVIEW deployment must not use STORAGE_BACKEND=r2 — that would write to the production R2 bucket. Set STORAGE_BACKEND=local in the Preview env scope.';
    console.error(msg);
    throw new Error(msg);
  }

  const { getEnv } = await import('./lib/env');
  try {
    getEnv();
    console.log('[env] validated successfully');
  } catch (err) {
    console.error('[env] validation FAILED:\n', err instanceof Error ? err.message : err);
    // In production, fail-fast. In dev, surface the warning but keep going so
    // dev workflows that intentionally omit OPENAI_API_KEY etc. still boot.
    if (process.env.NODE_ENV === 'production') {
      throw err;
    }
  }
}
