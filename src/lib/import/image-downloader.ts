/**
 * IG/Shopee product image downloader (V1 #63, RA3 + RA9)
 *
 * Uses url-guard.ts safeFetch (SSRF + 5MB cap + 10s timeout + redirect re-validate),
 * writes to local-fs, returns r2Key (opaque storage key, R2-compat contract).
 *
 * Serial download (1 at a time) — avoids 5-20 items × 5MB peak OOM.
 */
import { safeFetch, ImportSourceUnavailableError } from './url-guard';
import { writeFile } from '@/lib/storage';

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

/**
 * Fetch image from URL → write into tenant dir → return storage key.
 * @param tenantId — RLS tenant id (drives the dir name)
 * @param imageUrl — must be a URL on the IMAGE_HOSTS allowlist (url-guard enforces)
 * @returns { key, publicUrl } — same contract as storage.writeFile
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

  // Confirm content-type is an image
  const ct = (fetched.contentType ?? '').split(';')[0].trim().toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(ct)) {
    throw new ImportSourceUnavailableError(
      `非預期的 content-type: ${ct} (僅支援 jpeg/png/webp/gif)`,
    );
  }

  return writeFile(tenantId, Buffer.from(fetched.body), ct);
}
