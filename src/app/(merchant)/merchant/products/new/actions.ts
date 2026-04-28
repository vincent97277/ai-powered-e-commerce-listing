'use server';

/**
 * Server Actions — 新商品建立流程
 *
 * 兩個 actions:
 *  1. signUploadUrl  → 簽 R2 presigned PUT URL 給前端直傳
 *  2. triggerIngest  → 上傳完成後 emit Inngest event 走背景 GPT-4o vision pipeline
 *
 * 為什麼前端直傳 R2:
 *  - 不走 Vercel function 帶寬 (Vercel 收 egress)
 *  - 避免 Vercel function 4.5MB body limit
 *  - presigned URL 5 分鐘 TTL，hackathon scope 夠用
 */

import { cookies } from 'next/headers';
import { inngest } from '@/inngest/client';
import {
  ALLOWED_CONTENT_TYPES,
  MAX_FILE_SIZE_BYTES,
  isAllowedContentType,
  presignUpload,
} from '@/lib/storage/r2-client';
import {
  DEMO_MERCHANT_COOKIE,
  getMerchantFromCookie,
} from '@/lib/storage/demo-merchants';

// ---------- signUploadUrl ----------

export type SignUploadResult =
  | { success: true; uploadUrl: string; key: string }
  | { success: false; error: string };

export async function signUploadUrl(opts: {
  contentType: string;
  fileSize: number;
}): Promise<SignUploadResult> {
  // 1. 從 cookie 拿 merchant (hackathon 用 slug → tenantId map)
  const cookieStore = await cookies();
  const merchant = getMerchantFromCookie(
    cookieStore.get(DEMO_MERCHANT_COOKIE)?.value,
  );

  // 2. validate file size
  if (opts.fileSize <= 0) {
    return { success: false, error: '檔案大小不可為 0' };
  }
  if (opts.fileSize > MAX_FILE_SIZE_BYTES) {
    return {
      success: false,
      error: `檔案超過 ${MAX_FILE_SIZE_BYTES / 1024 / 1024}MB 上限`,
    };
  }

  // 3. validate contentType
  if (!isAllowedContentType(opts.contentType)) {
    return {
      success: false,
      error: `僅支援 ${ALLOWED_CONTENT_TYPES.join(', ')}`,
    };
  }

  // 4. 簽 URL
  try {
    const { url, key } = await presignUpload({
      tenantId: merchant.tenantId,
      contentType: opts.contentType,
    });
    return { success: true, uploadUrl: url, key };
  } catch (err) {
    console.error('[signUploadUrl] presign 失敗', err);
    return {
      success: false,
      error: err instanceof Error ? err.message : 'presign 失敗',
    };
  }
}

// ---------- triggerIngest ----------

/**
 * 前端直傳 R2 完成後呼叫，把 r2Key 丟到 Inngest 背景處理 GPT-4o vision。
 * 不需要回傳處理結果，UI 改用 polling 或 realtime channel 拿最新狀態。
 */
export async function triggerIngest(opts: {
  r2Key: string;
}): Promise<{ ingested: boolean }> {
  const cookieStore = await cookies();
  const merchant = getMerchantFromCookie(
    cookieStore.get(DEMO_MERCHANT_COOKIE)?.value,
  );

  // 簡單防呆: r2Key 必須以 tenantId/ 開頭，避免拿到別 tenant 的 key
  if (!opts.r2Key.startsWith(`${merchant.tenantId}/`)) {
    console.warn('[triggerIngest] r2Key 不屬於目前 tenant，拒絕', {
      tenantId: merchant.tenantId,
      r2Key: opts.r2Key,
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
