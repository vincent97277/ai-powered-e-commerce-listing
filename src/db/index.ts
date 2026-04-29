/**
 * 雙 connection pool — node-postgres (pg) driver, local-first
 * dbUser  → web_anon role，RLS 強制生效 (預設用這個)
 * dbAdmin → web_admin role，BYPASSRLS (僅限 admin-only/ 目錄)
 *
 * v2 升級到 Neon: 換成 drizzle-orm/neon-serverless + WebSocket driver
 *
 * Lazy init — build time 沒 .env 不會炸，runtime 第一次 query 才 throw
 */
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

function makeDb(envKey: 'DATABASE_URL_USER' | 'DATABASE_URL_ADMIN', max: number) {
  let pool: Pool | null = null;
  let drz: ReturnType<typeof drizzle<typeof schema>> | null = null;

  const init = () => {
    if (drz) return drz;
    const url = process.env[envKey];
    if (!url) throw new Error(`${envKey} 未設定 (見 .env.local.example)`);
    pool = new Pool({ connectionString: url, max });
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
export const dbUser = makeDb('DATABASE_URL_USER', 5);

/** BYPASSRLS 連線 — 僅限平台 admin / tenant resolver / migration */
export const dbAdmin = makeDb('DATABASE_URL_ADMIN', 3);

export type DbUser = typeof dbUser;
export type DbAdmin = typeof dbAdmin;
