/**
 * Next.js instrumentation hook — runs once per server process at boot.
 * V2.2.1 reason: validate environment variables at startup so a typo'd env
 * name is a boot failure, not a quiet 500 on the first user request.
 *
 * Docs: https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

export async function register() {
  // Only validate on the actual server runtimes; the Edge runtime has a
  // narrower env shape and the build phase has no env at all.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
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
}
