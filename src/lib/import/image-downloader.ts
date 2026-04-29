/**
 * IG/蝦皮 商品圖下載 (V1 #63, RA3 + RA9)
 *
 * 用 url-guard.ts safeFetch (含 SSRF + 5MB cap + 10s timeout + redirect re-validate)
 * 然後寫到 local-fs, 回 r2Key (opaque storage key, R2-compat contract)
 *
 * 序列下載 (一次 1 張) 避免 5-20 件 × 5MB peak OOM
 */
import { safeFetch, ImportSourceUnavailableError } from './url-guard';
import { writeFileLocal } from '@/lib/storage/local-fs';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * 從 URL 抓圖 → 寫到 tenant 目錄 → 回 storage key
 * @param tenantId — RLS tenant id (driver of dir name)
 * @param imageUrl — 必須是 IMAGE_HOSTS allowlist 內的 URL (url-guard 會擋)
 * @returns { key, publicUrl } — 跟 writeFileLocal 同 contract
 */
export async function downloadImageToStorage(
  tenantId: string,
  imageUrl: string,
): Promise<{ key: string; publicUrl: string }> {
  const fetched = await safeFetch(imageUrl, {
    kind: 'image',
    method: 'GET',
    timeoutMs: 10_000,
    maxBytes: 5 * 1024 * 1024, // 5MB
  });

  // 確認 content-type 是圖
  const ct = (fetched.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(ct)) {
    throw new ImportSourceUnavailableError(
      `非預期的 content-type: ${ct} (僅支援 jpeg/png/webp/gif)`,
    );
  }

  return writeFileLocal(tenantId, Buffer.from(fetched.body), ct);
}
