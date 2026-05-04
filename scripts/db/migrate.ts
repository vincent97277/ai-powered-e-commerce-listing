/**
 * Custom SQL migration runner.
 *
 * V2.2.0 reason: drizzle-kit's journal only tracks 0000-0002 (drizzle-generated),
 * but we have hand-written RLS / feature migrations 0001a_init_rls + 0003-0008
 * that drizzle-kit migrate refuses to run. Local dev historically used `db:push`
 * (schema push, not migrations) plus manual psql for RLS — fragile, won't work
 * on Neon prod.
 *
 * This runner replaces drizzle-kit migrate. Reads every drizzle/migrations/*.sql
 * (excluding .rollback.sql), tracks applied filenames in `__migrations__` table,
 * runs each unapplied file in its own transaction.
 *
 * Usage:
 *   DATABASE_URL=postgres://owner:... tsx scripts/db/migrate.ts
 *   DATABASE_URL=... tsx scripts/db/migrate.ts --bootstrap-existing  # mark all as applied
 *   DATABASE_URL=... tsx scripts/db/migrate.ts --status               # show what's applied
 *
 * Bootstrap mode: if you have an existing local dev DB built via `db:push`,
 * the schema is already there but `__migrations__` is empty. Running migrate
 * will fail on "relation already exists." Use --bootstrap-existing once to
 * record all current migration files as applied without running them.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const MIGRATIONS_DIR = join(process.cwd(), 'drizzle', 'migrations');

/**
 * Filename contract: 4 digits, then optional letter suffix, then '_', then desc.
 * Examples that pass: 0000_init.sql, 0001a_init_rls.sql, 0008_v2_merchant_auth.sql
 * Examples that fail: 8_init.sql, 0008.5_hotfix.sql, init_0001.sql
 *
 * Letter suffix (a/b/c) lets you slot a hand-written migration between two
 * drizzle-generated ones without renaming everything downstream.
 */
const FILENAME_RE = /^\d{4}[a-z]?_[a-z0-9_-]+\.sql$/i;

function listMigrationFiles(): string[] {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql') && !f.endsWith('.rollback.sql'))
    .sort();

  const malformed = files.filter((f) => !FILENAME_RE.test(f));
  if (malformed.length > 0) {
    throw new Error(
      `Malformed migration filenames (must match /^\\d{4}[a-z]?_.+\\.sql$/):\n  ${malformed.join('\n  ')}`,
    );
  }
  return files;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS __migrations__ (
      filename text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function getAppliedSet(client: Client): Promise<Set<string>> {
  const { rows } = await client.query<{ filename: string }>(
    'SELECT filename FROM __migrations__ ORDER BY filename',
  );
  return new Set(rows.map((r) => r.filename));
}

async function applyMigration(client: Client, filename: string): Promise<void> {
  const sql = readFileSync(join(MIGRATIONS_DIR, filename), 'utf8');
  await client.query('BEGIN');
  try {
    await client.query(sql);
    await client.query('INSERT INTO __migrations__(filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  }
}

async function bootstrapExisting(client: Client, files: string[]): Promise<number> {
  let inserted = 0;
  for (const f of files) {
    const result = await client.query(
      'INSERT INTO __migrations__(filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [f],
    );
    if (result.rowCount && result.rowCount > 0) inserted++;
  }
  return inserted;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const bootstrap = args.includes('--bootstrap-existing');
  const status = args.includes('--status');

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL not set. Use the owner role connection string.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedSet(client);
    const files = listMigrationFiles();

    if (status) {
      console.log(`Total migration files: ${files.length}`);
      console.log(`Applied: ${applied.size}`);
      console.log(`Pending: ${files.length - applied.size}\n`);
      for (const f of files) {
        console.log(`  ${applied.has(f) ? '✓' : ' '} ${f}`);
      }
      return;
    }

    if (bootstrap) {
      const inserted = await bootstrapExisting(client, files);
      console.log(
        `Bootstrap complete: marked ${inserted} migration(s) as applied without running them.`,
      );
      console.log('Future runs will only apply NEW migrations.');
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log(`All ${files.length} migrations already applied. Nothing to do.`);
      return;
    }

    console.log(`Found ${pending.length} pending migration(s):\n`);
    for (const f of pending) console.log(`  - ${f}`);
    console.log('');

    for (const f of pending) {
      process.stdout.write(`Applying ${f}... `);
      await applyMigration(client, f);
      console.log('✓');
    }

    console.log(`\nDone. Applied ${pending.length} migration(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
