/**
 * Migration runner test — verifies the custom SQL migration runner.
 *
 * V2.2.0: drizzle-kit's journal was incomplete (only tracked 0000-0002), so
 * we replaced db:migrate with a custom runner. This test creates an ephemeral
 * test database, runs the migration runner script against it via tsx, and
 * verifies that all 10 migration files were applied + tracked in __migrations__.
 *
 * Prereq: local docker postgres running with owner role.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { Client } from 'pg';

const OWNER_URL = process.env.DATABASE_URL ?? 'postgresql://owner:owner_pass@localhost:5432/rls_ai_shop';
const TEST_DB_NAME = `migrate_runner_test_${Date.now()}`;

// Build a connection URL pointing at the test DB.
function urlForDb(name: string): string {
  return OWNER_URL.replace(/\/[^/]+(\?.*)?$/, `/${name}$1`);
}

// Connect to the default postgres DB so we can CREATE/DROP test DB.
function adminUrl(): string {
  return OWNER_URL.replace(/\/[^/]+(\?.*)?$/, '/postgres$1');
}

async function withClient<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

describe('migration runner', () => {
  beforeAll(async () => {
    await withClient(adminUrl(), async (c) => {
      await c.query(`CREATE DATABASE ${TEST_DB_NAME}`);
    });
  });

  afterAll(async () => {
    await withClient(adminUrl(), async (c) => {
      await c.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    });
  });

  it('applies all migrations to a fresh database and tracks them', () => {
    const url = urlForDb(TEST_DB_NAME);
    const out = execSync('tsx scripts/db/migrate.ts', {
      env: { ...process.env, DATABASE_URL: url },
      encoding: 'utf8',
    });
    expect(out).toMatch(/Applied 10 migration\(s\)/);
  }, 30_000);

  it('is idempotent (second run is a no-op)', () => {
    const url = urlForDb(TEST_DB_NAME);
    const out = execSync('tsx scripts/db/migrate.ts', {
      env: { ...process.env, DATABASE_URL: url },
      encoding: 'utf8',
    });
    expect(out).toMatch(/already applied/);
  }, 15_000);

  it('records every migration in __migrations__ table', async () => {
    await withClient(urlForDb(TEST_DB_NAME), async (c) => {
      const { rows } = await c.query<{ filename: string }>(
        'SELECT filename FROM __migrations__ ORDER BY filename',
      );
      expect(rows).toHaveLength(10);
      expect(rows.map((r) => r.filename)).toEqual([
        '0000_moaning_mimic.sql',
        '0001_confused_stone_men.sql',
        '0001a_init_rls.sql',
        '0002_low_wonder_man.sql',
        '0003_v1_rls.sql',
        '0004_v15_provider_col.sql',
        '0005_revert_provider_col.sql',
        '0006_ai_usage_events.sql',
        '0007_v17_onboarding_hardening.sql',
        '0008_v2_merchant_auth.sql',
      ]);
    });
  });

  it('creates the merchants table (proves schema migrations actually ran)', async () => {
    await withClient(urlForDb(TEST_DB_NAME), async (c) => {
      const { rows } = await c.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'merchants'
      `);
      expect(rows).toHaveLength(1);
    });
  });

  it('creates the merchant_sessions table (proves V2 migration 0008 ran)', async () => {
    await withClient(urlForDb(TEST_DB_NAME), async (c) => {
      const { rows } = await c.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'merchant_sessions'
      `);
      expect(rows).toHaveLength(1);
    });
  });

  it('creates the ai_usage_events table (proves V1.5 migration 0006 ran)', async () => {
    await withClient(urlForDb(TEST_DB_NAME), async (c) => {
      const { rows } = await c.query<{ table_name: string }>(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'ai_usage_events'
      `);
      expect(rows).toHaveLength(1);
    });
  });
});
