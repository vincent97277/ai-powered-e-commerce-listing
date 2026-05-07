/**
 * Preflight for `pnpm test:smoke:ai-local`.
 *
 * Smoke tests fail mysteriously when prereqs are missing. This script gives
 * one clear "fix this" message instead of a Playwright timeout 60 seconds
 * deep into a real OpenAI call. Each check is cheap (<200ms) and runs
 * before Playwright is even invoked.
 */
import { config as dotenvConfig } from 'dotenv';
import { Pool } from 'pg';

dotenvConfig({ path: '.env.local' });

type Check = {
  name: string;
  fix: string;
  run: () => Promise<{ ok: boolean; detail?: string }>;
};

const checks: Check[] = [
  {
    name: 'Dev server reachable on http://localhost:3000',
    fix: 'Start it in another terminal: `pnpm dev`',
    run: async () => {
      try {
        const r = await fetch('http://localhost:3000/', { signal: AbortSignal.timeout(2000) });
        return { ok: r.status < 500, detail: `HTTP ${r.status}` };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  {
    name: 'Inngest dev CLI reachable on http://localhost:8288',
    fix: 'Start it in another terminal: `pnpm inngest:dev` (or `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest`)',
    run: async () => {
      try {
        const r = await fetch('http://localhost:8288/', { signal: AbortSignal.timeout(2000) });
        return { ok: r.status < 500, detail: `HTTP ${r.status}` };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      }
    },
  },
  {
    name: 'OPENAI_API_KEY present in .env.local',
    fix: 'Add a real OPENAI_API_KEY=sk-... to .env.local. Without it the smoke runs against fixture-fallback path which defeats the test purpose.',
    run: async () => {
      const k = process.env.OPENAI_API_KEY;
      if (!k) return { ok: false, detail: '<missing>' };
      if (!k.startsWith('sk-')) return { ok: false, detail: `unexpected prefix: "${k.slice(0, 5)}..."` };
      if (k.length < 20) return { ok: false, detail: 'too short to be a real key' };
      return { ok: true };
    },
  },
  {
    name: 'DATABASE_URL_ADMIN present in .env.local',
    fix: 'Add it to .env.local — needed for direct ai_usage_events table assertion.',
    run: async () => {
      return { ok: !!process.env.DATABASE_URL_ADMIN };
    },
  },
  {
    name: 'DEMO_MERCHANT_AKAMI_ID present in .env.local',
    fix: 'Add it to .env.local — the smoke uses akami merchant for upload.',
    run: async () => {
      return { ok: !!process.env.DEMO_MERCHANT_AKAMI_ID };
    },
  },
  {
    name: 'akami merchant exists in DB with bcrypted password',
    fix: 'Re-seed: `pnpm tsx scripts/seed-merchant-auth.ts` (dev mode). Confirms password is `demo1234`.',
    run: async () => {
      const dsn = process.env.DATABASE_URL_ADMIN;
      if (!dsn) return { ok: false, detail: 'DATABASE_URL_ADMIN missing (caught above)' };
      const pool = new Pool({ connectionString: dsn, max: 1 });
      try {
        const r = await pool.query<{ slug: string; has_email: boolean; has_pw: boolean }>(
          `SELECT slug, email IS NOT NULL AS has_email, password_hash IS NOT NULL AS has_pw
           FROM merchants WHERE slug = 'akami'`,
        );
        if (r.rows.length === 0) {
          return { ok: false, detail: 'no merchant with slug=akami' };
        }
        const m = r.rows[0];
        if (!m.has_email || !m.has_pw) {
          return { ok: false, detail: `akami exists but missing email=${m.has_email} or password=${m.has_pw}` };
        }
        return { ok: true };
      } catch (err) {
        return { ok: false, detail: err instanceof Error ? err.message : String(err) };
      } finally {
        await pool.end().catch(() => {});
      }
    },
  },
  {
    name: 'tests/fixtures/smoke-product.jpg exists',
    fix: 'The smoke test fixture image is missing — this should be committed in the repo.',
    run: async () => {
      const { existsSync } = await import('node:fs');
      return { ok: existsSync('tests/fixtures/smoke-product.jpg') };
    },
  },
];

async function main(): Promise<void> {
  console.log('AI vision smoke preflight\n');

  const failures: Array<{ name: string; fix: string; detail?: string }> = [];

  for (const check of checks) {
    process.stdout.write(`  ${check.name} ... `);
    const result = await check.run();
    if (result.ok) {
      console.log('OK' + (result.detail ? ` (${result.detail})` : ''));
    } else {
      console.log(`FAIL${result.detail ? ` (${result.detail})` : ''}`);
      failures.push({ name: check.name, fix: check.fix, detail: result.detail });
    }
  }

  if (failures.length > 0) {
    console.log(`\n${failures.length} preflight check(s) failed. Fix and retry:\n`);
    for (const f of failures) {
      console.log(`  - ${f.name}`);
      console.log(`      → ${f.fix}\n`);
    }
    process.exit(1);
  }

  console.log('\nAll preflight checks passed. Running Playwright now (1-2 min, costs ~$0.02 in OpenAI).');
}

main().catch((err) => {
  console.error('preflight crashed:', err);
  process.exit(1);
});
