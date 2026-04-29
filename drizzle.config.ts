/**
 * drizzle-kit config
 * Migration 用 owner connection (DATABASE_URL，預設 macOS user)
 */
import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

config({ path: '.env.local' });

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) throw new Error('DATABASE_URL 未設定 (見 .env.local.example)');

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'postgresql',
  dbCredentials: { url: ownerUrl },
  strict: true,
  verbose: true,
});
