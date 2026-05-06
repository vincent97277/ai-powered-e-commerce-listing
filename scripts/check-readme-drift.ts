/**
 * Drift checker — guards against README rotting against reality.
 *
 * Why: V2.3.6 inventory found README claiming MIT license / 154 tests / `bun`
 * commands when the project is Apache-2.0 / 260+ tests / pnpm. This script
 * runs in CI so the next stale-claim regression fails the build instead of
 * shipping for 8 versions.
 *
 * Run: pnpm lint:docs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Always invoked from repo root via `pnpm lint:docs`. Avoids the
// import.meta.dirname-undefined-under-CJS-tsx issue.
const ROOT = process.cwd();
const README = join(ROOT, 'README.md');
const LICENSE = join(ROOT, 'LICENSE');
const PACKAGE_JSON = join(ROOT, 'package.json');

type Issue = { severity: 'error' | 'warn'; message: string };
const issues: Issue[] = [];

function err(message: string) {
  issues.push({ severity: 'error', message });
}
function warn(message: string) {
  issues.push({ severity: 'warn', message });
}

const readme = readFileSync(README, 'utf-8');
const licenseHeader = readFileSync(LICENSE, 'utf-8').slice(0, 200);
const pkg = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')) as {
  license?: string;
  packageManager?: string;
};

// 1. License consistency: README badge ↔ LICENSE file ↔ package.json
const licenseInFile = licenseHeader.includes('Apache License')
  ? 'Apache-2.0'
  : licenseHeader.includes('MIT License')
    ? 'MIT'
    : 'Unknown';

if (!pkg.license) {
  err(
    'package.json has no `license` field. npm/yarn tooling will infer UNLICENSED. Set it to match LICENSE file.',
  );
} else if (pkg.license !== licenseInFile) {
  err(
    `package.json license="${pkg.license}" but LICENSE file is ${licenseInFile}. Pick one.`,
  );
}

const readmeBadgeMatch = readme.match(
  /!\[License\]\(https:\/\/img\.shields\.io\/badge\/license-([^-)]+)/i,
);
if (readmeBadgeMatch) {
  const badgeLicense = readmeBadgeMatch[1];
  // "Apache" or "Apache--2.0" or "MIT" — normalize
  const normalized = badgeLicense.replace(/--/g, '-').replace(/-2\.0$/, '');
  const matches =
    (normalized === 'Apache' && licenseInFile === 'Apache-2.0') ||
    (normalized === 'MIT' && licenseInFile === 'MIT') ||
    normalized.toLowerCase() === licenseInFile.toLowerCase();
  if (!matches) {
    err(
      `README license badge says "${badgeLicense}" but LICENSE file is ${licenseInFile}.`,
    );
  }
}

// 2. Package manager: README must use pnpm, never bun*/npm install
// V2.3.9 retro fix: added `bun i` and `npm i` short-forms (Eng+DX dual voices).
const banned = [
  { pattern: /\bbun install\b/, name: 'bun install' },
  { pattern: /\bbun\s+i\b/, name: 'bun i (short for install)' },
  { pattern: /\bbunx\s+\w/, name: 'bunx <cmd>' },
  { pattern: /\bbun\s+run\s+\w/, name: 'bun run <script>' },
  { pattern: /\bnpm\s+install\b/, name: 'npm install' },
  { pattern: /\bnpm\s+i\b/, name: 'npm i (short for install)' },
  { pattern: /\byarn\s+install\b/, name: 'yarn install' },
  { pattern: /\byarn\s+add\b/, name: 'yarn add' },
];

for (const b of banned) {
  if (b.pattern.test(readme)) {
    err(
      `README contains banned command \`${b.name}\`. This project is pnpm (DECISIONS.md). Use \`pnpm install\` / \`pnpm exec\` / \`pnpm <script>\`.`,
    );
  }
}

if (!pkg.packageManager?.startsWith('pnpm@')) {
  warn(
    'package.json `packageManager` should be pinned to a pnpm version (e.g. "pnpm@9.12.0").',
  );
}

// 3. Test count badge — must be within 5% of the actual test file count
// Heuristic: count `it(` / `test(` calls across tests/ as a proxy.
const testsRoot = join(ROOT, 'tests');
let testCount = 0;
function walkTests(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walkTests(full);
      continue;
    }
    if (!/\.(test|spec)\.tsx?$/.test(entry)) continue;
    const src = readFileSync(full, 'utf-8');
    // Match `it(` / `test(` at line start or after { or , — best-effort.
    const matches = src.match(/(?:^|[\s{(,;])(?:it|test)\s*\(/gm);
    if (matches) testCount += matches.length;
  }
}
walkTests(testsRoot);

const badgeMatch = readme.match(/badge\/tests-(\d+)%20passing/);
if (badgeMatch) {
  const claimed = parseInt(badgeMatch[1], 10);
  const drift = Math.abs(claimed - testCount) / testCount;
  if (drift > 0.1) {
    err(
      `README test count badge says ${claimed} but actual test count is ~${testCount} (${(drift * 100).toFixed(0)}% drift). Update the badge.`,
    );
  } else if (drift > 0.05) {
    warn(
      `README test count badge says ${claimed}, actual ~${testCount} (${(drift * 100).toFixed(0)}% drift). Acceptable but worth refreshing.`,
    );
  }
}

// 4. Quickstart-section sanity: must mention pnpm
const quickstartMatch = readme.match(/##\s+Quickstart[\s\S]*?(?=\n##\s+|\n#\s+|$)/);
if (quickstartMatch) {
  const qs = quickstartMatch[0];
  if (!qs.includes('pnpm')) {
    err('README Quickstart section does not mention `pnpm`. It must.');
  }
  if (qs.includes('db:push')) {
    err(
      'README Quickstart uses `db:push`. Use `pnpm db:migrate` (the custom runner with format guards). `db:push` is dev-iteration only — never in onboarding docs.',
    );
  }
}

// 5. V2.3.9 retro: tests using `.rejects.toThrow(/db-driver-text/)` must use
// `expectRejectsMatching` from `tests/_helpers/db-error.ts` instead. Drizzle
// 0.45+ wraps errors so `.message` is "Failed query: ..." and the regex never
// matches — silent test breakage.
const dbErrorPattern =
  /\.rejects\.toThrow\(\s*\/[^/\n]*(?:row-level security|permission denied|insufficient|policy violation)[^/\n]*\/[gimuy]*\s*\)/i;
function listTestFiles(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTestFiles(full, files);
      continue;
    }
    if (/\.(test|spec)\.tsx?$/.test(entry)) files.push(full);
  }
  return files;
}
const testFiles = listTestFiles(testsRoot);
for (const f of testFiles) {
  const src = readFileSync(f, 'utf-8');
  if (dbErrorPattern.test(src)) {
    const rel = f.replace(`${ROOT}/`, '');
    err(
      `${rel}: uses .rejects.toThrow(/db-driver-text/) — drizzle 0.45+ wraps errors so this never matches. Use expectRejectsMatching from tests/_helpers/db-error.ts (DECISIONS.md § Tests).`,
    );
  }
}

// Report
const errors = issues.filter((i) => i.severity === 'error');
const warnings = issues.filter((i) => i.severity === 'warn');

console.log(`\nREADME drift check — tests counted: ${testCount}`);
console.log(`License: ${licenseInFile} (file) | ${pkg.license ?? '(missing)'} (package.json)`);

if (warnings.length > 0) {
  console.log(`\n⚠️  ${warnings.length} warning(s):`);
  for (const w of warnings) console.log(`  - ${w.message}`);
}

if (errors.length > 0) {
  console.log(`\n❌ ${errors.length} error(s):`);
  for (const e of errors) console.log(`  - ${e.message}`);
  process.exit(1);
}

console.log(`\n✓ README in sync with reality.`);
