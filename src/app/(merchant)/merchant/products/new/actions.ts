'use server';

/**
 * Server Actions — 新商品建立流程 (local-first)
 *
 * 流程簡化版 (local-first hackathon):
 *  1. 前端 POST FormData → /api/uploads (寫到 public/uploads/)
 *  2. 拿到回傳的 storage key → 呼叫 triggerIngest()
 *  3. triggerIngest emit Inngest event → 背景 GPT-4o vision pipeline
 *
 * v2 升級時 R2: 把 /api/uploads route 換成 presigned URL 即可
 */

import { cookies } from 'next/headers';
import { inngest } from '@/inngest/client';
import {
  DEMO_MERCHANT_COOKIE,
  getMerchantFromCookie,
} from '@/lib/storage/demo-merchants';

/**
 * 上傳完成後呼叫，把 storage key 丟到 Inngest 背景處理 GPT-4o vision
 */
export async function triggerIngest(opts: {
  r2Key: string; // 變數名留 r2Key (向後相容)，實際是 local-fs key
}): Promise<{ ingested: boolean }> {
  const cookieStore = await cookies();
  const merchant = getMerchantFromCookie(
    cookieStore.get(DEMO_MERCHANT_COOKIE)?.value,
  );

  // 防呆: storage key 必須以 tenantId/ 開頭
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
      merchantId: merchant.merchantId,
    },
  });

  return { ingested: true };
}
