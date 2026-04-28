/**
 * Vitest setup — 載 .env.local 給 RLS test 用
 */
import { config } from 'dotenv';

config({ path: '.env.local' });

if (!process.env.DATABASE_URL_USER || !process.env.DATABASE_URL_ADMIN) {
  throw new Error(
    'RLS e2e test 需要 DATABASE_URL_USER + DATABASE_URL_ADMIN env vars。請檢查 .env.local'
  );
}
