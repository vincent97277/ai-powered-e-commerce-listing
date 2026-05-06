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

// 6. V2.4: broken markdown relative links across docs (catches link-rot from
// future doc moves, e.g. archiving BUILD_DAY or moving anything into docs/).
// Walk all *.md at root + .github + docs, extract relative links, assert each
// resolves. Skip URLs (http*), mailto:, anchors (#foo).
import { dirname } from 'node:path';

const docFiles: string[] = [];
function walkMarkdown(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkMarkdown(full, files);
    } else if (/\.md$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}
walkMarkdown(ROOT, docFiles);

const linkPattern = /(?:!?\[[^\]]*\])\(((?!https?:|mailto:|#)[^)\s]+?)(?:\s+"[^"]*")?\)/g;
let brokenCount = 0;
for (const f of docFiles) {
  let src = readFileSync(f, 'utf-8');
  // Strip fenced code blocks (```...```) and inline code (`...`) before
  // scanning — links inside code are documentation/syntax illustrations,
  // not real links. Without this, CHANGELOG's `[![Live demo](...)]` fires.
  src = src.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
  const dir = dirname(f);
  let m: RegExpExecArray | null;
  while ((m = linkPattern.exec(src)) !== null) {
    const target = m[1].split('#')[0]; // strip anchor
    if (!target) continue; // pure-anchor link
    if (/^\.+$/.test(target)) continue; // bare `...` placeholder
    const resolved = join(dir, target);
    try {
      statSync(resolved);
    } catch {
      const rel = f.replace(`${ROOT}/`, '');
      err(`${rel}: broken relative link → ${m[1]}`);
      brokenCount++;
    }
  }
}

// 7. V2.4: stack-version drift between README and package.json.
// README claims like "Drizzle ORM 0.45" / "Next.js 15" / "React 19" / "Vitest 2"
// must match the major version in package.json deps.
const stackChecks: Array<{ readmeText: RegExp; pkgKey: string; pkgPath: 'dependencies' | 'devDependencies' }> = [
  { readmeText: /Drizzle ORM 0\.(\d+)/, pkgKey: 'drizzle-orm', pkgPath: 'dependencies' },
  { readmeText: /Next\.js 15/, pkgKey: 'next', pkgPath: 'dependencies' },
  { readmeText: /React 19/, pkgKey: 'react', pkgPath: 'dependencies' },
  { readmeText: /Vitest 2/, pkgKey: 'vitest', pkgPath: 'devDependencies' },
];
const pkgFull = JSON.parse(readFileSync(PACKAGE_JSON, 'utf-8')) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};
for (const c of stackChecks) {
  const m = readme.match(c.readmeText);
  if (!m) {
    warn(
      `README does not mention "${c.readmeText.source}" — stack version claim missing or restructured.`,
    );
    continue;
  }
  const installed = pkgFull[c.pkgPath]?.[c.pkgKey];
  if (!installed) {
    err(`${c.pkgKey} claimed in README but not found in package.json ${c.pkgPath}.`);
    continue;
  }
  // Extract major version from installed (e.g. "^0.45.2" → 0.45, "15.5.15" → 15)
  const installedMajor = installed.replace(/^[\^~]/, '').match(/^\d+(?:\.\d+)?/)?.[0];
  // Extract claimed version (e.g. "0.45" or "15")
  const claimedMatch = c.readmeText.source.match(/(\d+(?:\\\.\d+)?)/);
  const claimed = claimedMatch?.[1].replace(/\\/g, '');
  if (claimed && installedMajor && !installedMajor.startsWith(claimed)) {
    err(
      `Stack version drift: README says ${c.pkgKey} ${claimed}, package.json has ${installed}.`,
    );
  }
}

// 8. V2.6: blog snippet drift. docs/blog/*.md may include source-anchored
// snippets via `<!-- src: path:start-end -->` markers immediately before a
// fenced code block. The checker reads the actual source file at the given
// line range and asserts the snippet matches verbatim. A future refactor
// that changes the source code without updating the blog post fails CI
// instead of silently misrepresenting the codebase to readers.
//
// Marker syntax:
//   <!-- src: eslint.config.mjs:115-134 -->
//   ```js
//   ...content...
//   ```
//
// Single-line form (`:42` instead of `:42-42`) is also accepted.
const blogDir = join(ROOT, 'docs', 'blog');
function dirExists(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
if (dirExists(blogDir)) {
  const blogFiles = readdirSync(blogDir).filter((f) => /\.md$/.test(f));
  // Marker is its own line; after the marker, allow optional whitespace lines,
  // then a fenced code block. Capture the file path, line range, and snippet.
  const markerRe =
    /<!--\s*src:\s*([^\s:]+):(\d+)(?:-(\d+))?\s*-->\s*\n+```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/g;
  for (const f of blogFiles) {
    const blogPath = join(blogDir, f);
    const blogSrc = readFileSync(blogPath, 'utf-8');
    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(blogSrc)) !== null) {
      const [, srcRel, startStr, endStr, snippet] = m;
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : start;
      if (start < 1 || end < start) {
        err(`docs/blog/${f}: invalid range ${srcRel}:${start}-${end}`);
        continue;
      }
      const srcAbs = join(ROOT, srcRel);
      let srcContent: string;
      try {
        srcContent = readFileSync(srcAbs, 'utf-8');
      } catch {
        err(`docs/blog/${f}: source file not found → ${srcRel}`);
        continue;
      }
      const lines = srcContent.split('\n');
      if (end > lines.length) {
        err(
          `docs/blog/${f}: ${srcRel}:${start}-${end} exceeds file length (${lines.length} lines).`,
        );
        continue;
      }
      const expected = lines.slice(start - 1, end).join('\n');
      if (snippet.trim() !== expected.trim()) {
        // Surface a hint at first divergence to make the fix obvious.
        const expLines = expected.split('\n');
        const actLines = snippet.split('\n');
        let firstDiff = -1;
        for (let i = 0; i < Math.max(expLines.length, actLines.length); i++) {
          if ((expLines[i] ?? '') !== (actLines[i] ?? '')) {
            firstDiff = i;
            break;
          }
        }
        const hint =
          firstDiff >= 0
            ? `\n      first diff at line ${start + firstDiff}:\n        source:  ${(expLines[firstDiff] ?? '<eof>').slice(0, 100)}\n        in blog: ${(actLines[firstDiff] ?? '<eof>').slice(0, 100)}`
            : '';
        err(
          `docs/blog/${f}: snippet drift vs ${srcRel}:${start}-${end}.${hint}`,
        );
      }
    }
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
