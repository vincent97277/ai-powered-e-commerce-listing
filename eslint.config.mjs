/**
 * ESLint flat config — Next.js 15 + dbAdmin 防護
 * dbAdmin 只允許 (admin)/** / lib/tenant/resolver.ts / lib/db/admin-only/** 使用
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
      'src/app/api/products/generate/**',  // sync vision endpoint 需查 brand_voice (system query)
      'src/app/onboarding/**',             // signup 需建 merchant (寫入 BYPASSRLS)
      'src/app/(merchant)/**',             // 商家後台需 BYPASSRLS 解析 cookie 對應的 merchant
      'src/app/(storefront)/**',           // storefront 需 BYPASSRLS 拿商家 theme/name
      'src/lib/admin-session.ts',          // V1 admin auth gate (#43): 管理 admin_sessions table
      'src/lib/platform/**',               // V1 platform 公開 query (RA17): 跨商家 dbAdmin 查熱門店鋪
      'src/lib/merchant/**',               // V1 suspend guard (#53): 純 read merchant 狀態
      'src/lib/observability/**',          // V1 import-log (#69): logger 不 import dbAdmin 但語意上屬同類
      'src/lib/admin/**',                  // V1.6 A8 operator queue: cross-tenant admin observability
    ],
    rules: { 'no-restricted-imports': 'off' },
  },
];
