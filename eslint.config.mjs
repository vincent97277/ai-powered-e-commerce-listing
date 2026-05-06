/**
 * ESLint flat config — Next.js 15 + dbAdmin 防護 + V1.9 T1 raw-color guard
 *
 * dbAdmin 允許範圍 (V2.6 narrowed):
 *   - (admin)/** + lib/admin/** + lib/observability/**         — platform admin / cross-tenant observability
 *   - inngest/** + lib/storage/** + scripts/**                 — worker/system context, non-RLS
 *   - lib/tenant/resolver.ts + lib/platform/** + lib/merchant/* — pre-tenant resolution + cross-merchant queries
 *   - lib/admin-session.ts + lib/merchant-session.ts            — session table management (admin observability)
 *   - app/onboarding/** + lib/onboarding/**                     — signup creates merchant before tenant context
 *   - app/api/products/generate/** + app/api/health/**          — cross-pool / cap-check paths
 *   - lib/db/admin-only/** + db/index.ts                        — the dbAdmin source itself
 *   - 3 narrow exceptions in user-facing routes (V2.6):
 *       app/(merchant)/layout.tsx                  — cookie → merchant lookup
 *       app/(storefront)/store/[slug]/layout.tsx   — slug → merchant lookup
 *       app/(merchant)/merchant/settings/actions.ts — UPDATE on merchants (no RLS policy on that table)
 *
 * Raw color classes (bg-zinc-*, bg-red-50, etc.) 禁用於 (admin)/(merchant)/(storefront)
 *   pages + src/components/* — 改用 brand vars / semantic utilities / StatusChip.
 */
import { FlatCompat } from '@eslint/eslintrc';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const compat = new FlatCompat({ baseDirectory: __dirname });

const dbAdminRule = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/db',
            importNames: ['dbAdmin'],
            message:
              'dbAdmin 會繞過 RLS。請改 import dbUser，或將檔案移至 (admin)/ 或 lib/db/admin-only/',
          },
          {
            name: '@/db/admin-only',
            message:
              'admin-only 模組僅允許 (admin)/** / lib/tenant/resolver.ts 使用',
          },
        ],
      },
    ],
  },
};

/**
 * V1.9 T1 — raw color regex banlist.
 *
 * Catches bg-zinc-{50..900}, text-zinc-{...}, border-zinc-{...}, plus the worst
 * offenders bg-amber-50 / bg-red-50 / bg-emerald-50 / text-emerald-700 / text-red-700
 * that leaked into admin pages, AND the literal `'rgb(228 228 231)'` style string
 * (zinc-200) used in /admin/queue/page.tsx.
 *
 * Use brand-aware tokens / semantic utilities / StatusChip instead.
 *
 * Implementation note: we use no-restricted-syntax with regex string-literal
 * matching, since ESLint can't introspect Tailwind class strings semantically.
 */
const ZINC_SHADES = '50|100|200|300|400|500|600|700|800|900';
const RAW_COLOR_PATTERNS = [
  // Tailwind zinc-* utilities (any prefix)
  `\\b(bg|text|border|ring|divide|placeholder|caret|fill|stroke|outline|from|via|to|decoration|accent|shadow)-zinc-(${ZINC_SHADES})\\b`,
  `\\bhover:(bg|text|border)-zinc-(${ZINC_SHADES})\\b`,
  `\\bfocus:(bg|text|border)-zinc-(${ZINC_SHADES})\\b`,
  // Status-tinted raw classes
  `\\b(bg|text|border)-(red|emerald|amber|green|yellow)-(50|100|200|300|400|500|600|700|800|900)\\b`,
  `\\bhover:(bg|text|border)-(red|emerald|amber|green|yellow)-(50|100|200|300|400|500|600|700|800|900)\\b`,
];
const RAW_COLOR_REGEX = `/(${RAW_COLOR_PATTERNS.join('|')})/`;
// zinc-200 literal as inline style: 'rgb(228 228 231)' (any spacing)
const ZINC_200_RGB_REGEX = `/rgb\\(\\s*228\\s+228\\s+231\\s*\\)/`;

const rawColorBanRules = {
  'no-restricted-syntax': [
    'error',
    {
      selector: `Literal[value=${RAW_COLOR_REGEX}]`,
      message:
        'V1.9 T1: raw color class banned (bg-zinc-*, text-zinc-*, bg-red-50, etc.). Use brand vars / semantic utilities (text-ink-muted, surface-card, border-card-soft) / <StatusChip>.',
    },
    {
      selector: `TemplateElement[value.raw=${RAW_COLOR_REGEX}]`,
      message:
        'V1.9 T1: raw color class banned in template literal. Use brand vars / semantic utilities / <StatusChip>.',
    },
    {
      selector: `Literal[value=${ZINC_200_RGB_REGEX}]`,
      message:
        'V1.9 T1: literal rgb(228 228 231) /* zinc-200 */ banned. Use var(--border-hairline) / var(--border-card) / var(--brand-edge-18).',
    },
  ],
};

/**
 * V1.9 T1 scope — files actively migrated in Tier 1.
 * Lint rule is `error` here. Tier 2/3 will widen the glob as more files
 * are migrated; legacy admin/merchant files outside this list still pass
 * lint (so we don't gate the whole repo on full migration).
 */
const rawColorBan = {
  files: [
    // Tier 1 admin migrations
    'src/app/(admin)/admin/page.tsx',
    'src/app/(admin)/admin/queue/page.tsx',
    'src/app/(admin)/admin/cost/page.tsx',
    // StatusChip migration sites (per V1.9 T1 plan)
    'src/app/(merchant)/merchant/orders/page.tsx',
    'src/app/(merchant)/merchant/products/page.tsx',
    'src/components/merchant/MerchantInbox.tsx',
    // Foundation primitives — must stay clean
    'src/components/ui/StatusChip.tsx',
  ],
  // Escape hatch — StateSurface intentionally renders neutral fallback
  ignores: ['src/components/feedback/StateSurface.tsx'],
  rules: rawColorBanRules,
};

export default [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  dbAdminRule,
  // 例外：以下路徑允許 import dbAdmin
  {
    files: [
      'src/app/(admin)/**',
      'src/lib/tenant/resolver.ts',
      'src/db/admin-only/**',
      'src/db/index.ts',
      'src/inngest/**',         // background job 走 dbAdmin (worker context，非 user-facing)
      'src/lib/storage/**',     // R2 / 系統內部，非 RLS 範圍
      'src/app/api/products/generate/**',  // V2.2.5 enqueue + status: cap check + status query
      'src/app/api/health/**',             // V2.2.1 platform health probe: pings dbUser + dbAdmin
      'src/app/onboarding/**',             // signup 需建 merchant (寫入 BYPASSRLS)
      // V2.6 narrowed allowlist: was '(merchant)/**' + '(storefront)/**'
      // (broad, included entire user-facing surface). Narrowed to the 3 exact
      // files that truly need BYPASSRLS — pre-tenant cookie/slug resolution
      // and the merchants-table UPDATE path (merchants has no RLS policy
      // because storefronts cross-query, so writes need dbAdmin).
      'src/app/(merchant)/layout.tsx',                   // cookie → merchant lookup before withTenantTx context exists
      // [slug] in the path would be parsed as a glob character-class — use wildcard for the dynamic segment.
      'src/app/(storefront)/store/*/layout.tsx',         // slug → merchant resolution before tenant context exists
      'src/app/(merchant)/merchant/settings/actions.ts', // UPDATE on merchants (web_anon has no UPDATE grant; runtime guard via cookie session)
      'src/lib/admin-session.ts',          // V1 admin auth gate (#43): 管理 admin_sessions table
      'src/lib/merchant-session.ts',       // V2 merchant auth gate (task 103): 管理 merchant_sessions table
      'src/lib/platform/**',               // V1 platform 公開 query (RA17): 跨商家 dbAdmin 查熱門店鋪
      'src/lib/merchant/**',               // V1 suspend guard (#53): 純 read merchant 狀態
      'src/lib/observability/**',          // V1 import-log (#69): logger 不 import dbAdmin 但語意上屬同類
      'src/lib/admin/**',                  // V1.6 A8 operator queue: cross-tenant admin observability
      'src/lib/onboarding/**',             // V1.7 D1 onboarding hardening: IP rate-limit + abuse log (admin observability)
      'scripts/**',                        // V2 seed/maintenance scripts (admin context, run manually with dbAdmin)
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
  rawColorBan,
];
