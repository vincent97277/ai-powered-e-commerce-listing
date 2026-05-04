/**
 * Environment variable validation — V2.2.1 hardening.
 *
 * Why this exists: prior to V2.2 the codebase relied on lazy-throw at first
 * query / first session resolve. A typo'd env var name in prod meant quiet 500s
 * on the first user request, never a build-time signal. /autoplan eng review
 * (H6) flagged this as a deploy blocker.
 *
 * What this does:
 * - Parse process.env once on first getEnv() call, cache for subsequent
 * - In dev (NODE_ENV !== 'production') we allow optional secrets so the dev
 *   server boots without OPENAI_API_KEY etc.
 * - In prod we require all secrets and assert DATABASE_URL_* connection strings
 *   include sslmode=require (Neon / managed Postgres should always be TLS).
 *
 * NODE_ENV is read at call time (not module load) so tests can flip it between
 * cases via _resetEnvCacheForTesting().
 */
import { z } from 'zod';

/**
 * Production assertion: a Postgres URL must specify TLS in production.
 * pg-connection-string (used by node-postgres) does not enforce this on its
 * own — if the URL is missing sslmode, the driver may attempt cleartext.
 * Neon / Supabase / Vercel Postgres all require sslmode=require; reject any
 * URL that doesn't carry it in prod so misconfigurations are visible at boot.
 */
function assertTlsInProd(value: string | undefined, varName: string): void {
  if (!value) return;
  if (process.env.NODE_ENV !== 'production') return;
  const m = value.match(/[?&]sslmode=([^&]+)/);
  const mode = m?.[1]?.toLowerCase();
  if (mode === 'require' || mode === 'verify-ca' || mode === 'verify-full') return;
  throw new Error(
    `${varName} must include sslmode=require (or verify-ca / verify-full) in production. Got: ${
      mode ?? '<missing>'
    }`,
  );
}

function buildSchema() {
  const isProd = process.env.NODE_ENV === 'production';
  return z.object({
    DATABASE_URL: z.string().url().optional(),
    DATABASE_URL_USER: z.string().url(),
    DATABASE_URL_ADMIN: z.string().url(),
    NEXT_PUBLIC_APP_URL: z.string().url(),
    OPENAI_API_KEY: isProd ? z.string().min(20) : z.string().optional(),
    INNGEST_EVENT_KEY: isProd ? z.string().min(8) : z.string().optional(),
    INNGEST_SIGNING_KEY: isProd ? z.string().min(8) : z.string().optional(),
    DEMO_MERCHANT_AKAMI_ID: z.string().uuid().optional(),
    DEMO_MERCHANT_AFEN_ID: z.string().uuid().optional(),
    ADMIN_PASSWORD: z.string().min(1),
    ADMIN_SESSION_SECRET: z.string().min(32),
    MERCHANT_SESSION_SECRET: z.string().min(32),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  });
}

export type Env = z.infer<ReturnType<typeof buildSchema>>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const schema = buildSchema();
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertTlsInProd(parsed.data.DATABASE_URL_USER, 'DATABASE_URL_USER');
  assertTlsInProd(parsed.data.DATABASE_URL_ADMIN, 'DATABASE_URL_ADMIN');
  if (parsed.data.DATABASE_URL) {
    assertTlsInProd(parsed.data.DATABASE_URL, 'DATABASE_URL');
  }
  cached = parsed.data;
  return cached;
}

/** Test helper — reset memoized cache so tests can mutate process.env between cases. */
export function _resetEnvCacheForTesting(): void {
  cached = null;
}
