/**
 * withTenantTx — RLS tenant context helper, implements the §1.1 spec.
 * 1. Wraps in a transaction so set_config only affects the current connection.
 * 2. UUID format guard against SQL injection (tenant_id originates from cookie).
 * 3. is_local=true → set_config auto-resets at transaction end.
 */
import { sql } from 'drizzle-orm';
import { dbUser } from '@/db';

/** UUID v4 format check — any non-UUID string is rejected outright. */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Run a transaction inside RLS context.
 * @param tenantId - merchant.id (UUID) resolved from cookie
 * @param fn       - transaction callback receiving the tx object
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof dbUser.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`[withTenantTx] 無效 tenant_id 格式: ${tenantId}`);
  }

  return dbUser.transaction(async (tx) => {
    // is_local=true → only effective within current transaction; auto-cleared on COMMIT/ROLLBACK
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
