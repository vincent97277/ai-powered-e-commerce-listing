/**
 * drizzle-kit config
 * 注意：migration 必須用 owner role (DATABASE_URL)，不是 web_anon
 * 因為 CREATE TABLE / CREATE POLICY 需要 owner 權限。
 */
import { defineConfig } from 'drizzle-kit';

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error('DATABASE_URL 未設定 (owner role for migrations)');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: ownerUrl },
  strict: true,
  verbose: true,
});
