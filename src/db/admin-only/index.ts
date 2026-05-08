/**
 * dbAdmin re-export — guarded by ESLint no-restricted-imports.
 * Only (admin)/** / lib/tenant/resolver.ts / lib/db/admin-only/** are allowed to import.
 * Any business-logic import of this file is blocked outright by ESLint.
 */
export { dbAdmin } from '../index';
