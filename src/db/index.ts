/**
 * 雙 connection pool — node-postgres (pg) driver, local-first
 * dbUser  → web_anon role，RLS 強制生效 (預設用這個)
 * dbAdmin → web_admin role，BYPASSRLS (僅限 admin-only/ 目錄)
 *
 * V2.2.1 hardening:
 * - Explicit ssl config in production (was relying purely on URL string)
 * - max=1 in production (serverless cold containers each create their own
 *   pool; high `max` × many warm lambdas = Neon connection storm)
 *
 * v2 升級到 Neon: 換成 drizzle-orm/neon-serverless + WebSocket driver — TODO
 *
 * Lazy init — build time 沒 .env 不會炸，runtime 第一次 query 才 throw
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

/** RLS 強制連線 — 業務邏輯預設使用 */
export const dbUser = makeDb('DATABASE_URL_USER', USER_MAX);

/** BYPASSRLS 連線 — 僅限平台 admin / tenant resolver / migration */
export const dbAdmin = makeDb('DATABASE_URL_ADMIN', ADMIN_MAX);

export type DbUser = typeof dbUser;
export type DbAdmin = typeof dbAdmin;
