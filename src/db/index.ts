/**
 * Dual connection pool — node-postgres (pg) driver, local-first
 * dbUser  → web_anon role, RLS enforced (default — use this)
 * dbAdmin → web_admin role, BYPASSRLS (admin-only/ directory only)
 *
 * V2.2.1 hardening:
 * - Explicit ssl config in production (was relying purely on URL string)
 * - max=1 in production (serverless cold containers each create their own
 *   pool; high `max` × many warm lambdas = Neon connection storm)
 *
 * V2.2.6 pgBouncer-transaction-mode compat:
 * - Production DATABASE_URL_USER / _ADMIN should point at the Neon POOLED
 *   endpoint (host suffix `-pooler`), which runs pgBouncer in transaction
 *   mode. RLS via withTenantTx (src/lib/db/with-tenant.ts) uses
 *   `set_config(..., is_local=true)` inside a BEGIN/COMMIT — that is
 *   transaction-scoped state, which pgBouncer transaction-mode preserves
 *   correctly.
 * - node-postgres (pg) sends parameterized queries via the extended
 *   protocol with empty statement names (unprepared), so the pgBouncer
 *   prepared-statement-leak class of bugs does not apply here.
 * - To verify against your prod Neon URL before launch:
 *     DATABASE_URL_USER=<pooled> DATABASE_URL_ADMIN=<pooled> \
 *     pnpm tsx scripts/db/verify-pgbouncer.ts
 *   100 alternating tenant transactions; any RLS leak fails the script.
 *
 * v2 upgrade to Neon: switch to drizzle-orm/neon-serverless + WebSocket driver — TODO
 *
 * Lazy init — no .env at build time won't blow up; throws on first runtime query
 */
import { Pool, type PoolConfig } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const isProd = process.env.NODE_ENV === 'production';

/**
 * Per-pool max connections.
 * - Local dev / test: 5 / 3 (room for parallel test runs against local docker)
 * - Production (serverless): 1 — every cold function spawns its own pool, and
 *   the pgBouncer pooled endpoint on Neon caps server-side connections sharply.
 *   1 connection per pool × N warm lambdas = predictable, never starves Neon.
 */
const USER_MAX = isProd ? 1 : 5;
const ADMIN_MAX = isProd ? 1 : 3;

function buildPoolConfig(connectionString: string, max: number): PoolConfig {
  const cfg: PoolConfig = { connectionString, max };
  if (isProd) {
    // Explicit TLS — pg's pg-connection-string treats `sslmode=require` as an
    // alias for verify-full today but the lib has signaled this will change in
    // pg v9 to libpq semantics (weaker). Pin the strict behavior explicitly so
    // future pg upgrades don't silently downgrade us.
    cfg.ssl = { rejectUnauthorized: true };
  }
  return cfg;
}

function makeDb(envKey: 'DATABASE_URL_USER' | 'DATABASE_URL_ADMIN', max: number) {
  let pool: Pool | null = null;
  let drz: ReturnType<typeof drizzle<typeof schema>> | null = null;

  const init = () => {
    if (drz) return drz;
    const url = process.env[envKey];
    if (!url) throw new Error(`${envKey} 未設定 (見 .env.local.example)`);
    pool = new Pool(buildPoolConfig(url, max));
    drz = drizzle(pool, { schema });
    return drz;
  };

  return new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop) {
      const real = init();
      const value = real[prop as keyof typeof real];
      return typeof value === 'function' ? value.bind(real) : value;
    },
  });
}

/** RLS-enforced connection — default for business logic */
export const dbUser = makeDb('DATABASE_URL_USER', USER_MAX);

/** BYPASSRLS connection — platform admin / tenant resolver / migration only */
export const dbAdmin = makeDb('DATABASE_URL_ADMIN', ADMIN_MAX);

export type DbUser = typeof dbUser;
export type DbAdmin = typeof dbAdmin;
