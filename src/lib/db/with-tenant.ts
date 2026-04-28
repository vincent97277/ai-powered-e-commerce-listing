/**
 * withTenantTx — 整合 §1.1 spec 的 RLS tenant context helper
 * 1. 用 transaction 包住，確保 set_config 只影響當前連線
 * 2. UUID format guard 防止 SQL injection (tenant_id 來自 cookie)
 * 3. is_local=true → set_config 在 transaction 結束時自動 reset
 */
import { sql } from 'drizzle-orm';
import { dbUser } from '@/db';

/** UUID v4 格式檢查 — 任何非 UUID 字串直接拒絕 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 在 RLS context 下執行 transaction
 * @param tenantId - 從 cookie 解析出的 merchant.id (UUID)
 * @param fn       - transaction callback，收到 tx 物件
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof dbUser.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`[withTenantTx] 無效 tenant_id 格式: ${tenantId}`);
  }

  return dbUser.transaction(async (tx) => {
    // is_local=true → 僅當前 transaction 生效，COMMIT/ROLLBACK 後自動清除
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
