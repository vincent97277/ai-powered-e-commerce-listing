/**
 * dbAdmin re-export — 受 ESLint no-restricted-imports 保護
 * 只允許 (admin)/** / lib/tenant/resolver.ts / lib/db/admin-only/** import
 * 任何業務邏輯 import 此檔會被 ESLint 直接擋下。
 */
export { dbAdmin } from '../index';
