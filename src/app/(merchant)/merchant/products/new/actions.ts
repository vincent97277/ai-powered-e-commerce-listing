'use server';

import { cookies } from 'next/headers';
import { inngest } from '@/inngest/client';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';
import { assertNotSuspended } from '@/lib/merchant/suspend-guard';

/**
 * 上傳完成後觸發 Inngest 背景生成 (V1: 同時也走同步 /api/products/generate, 這是備用 path)
 */
export async function triggerIngest(opts: {
  r2Key: string;
}): Promise<{ ingested: boolean }> {
  const cookieStore = await cookies();
  const merchant = await resolveMerchantFromCookie(cookieStore.get('demo-merchant-id')?.value);

  // V1 #53: 停權商家不可上架新商品
  await assertNotSuspended(merchant.tenantId);

  if (!opts.r2Key.startsWith(`${merchant.tenantId}/`)) {
    console.warn('[triggerIngest] storage key 不屬於目前 tenant，拒絕', {
      tenantId: merchant.tenantId,
      key: opts.r2Key,
    });
    return { ingested: false };
  }

  await inngest.send({
    name: 'product.ingest',
    data: {
      tenantId: merchant.tenantId,
      r2Key: opts.r2Key,
      merchantId: merchant.tenantId,
    },
  });

  return { ingested: true };
}
