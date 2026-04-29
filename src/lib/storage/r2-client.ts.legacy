/**
 * Cloudflare R2 Client + Helpers
 *
 * 使用 @aws-sdk/client-s3 是因為 R2 100% S3 API compatible。
 *
 * 重要坑位 (踩過才知道):
 *  1. endpoint 必須帶 https:// 前綴，少了會 DNS error。
 *  2. region 一定填 'auto'，寫成 'us-east-1' R2 會 reject signature。
 *  3. forcePathStyle: true 可避免某些 SDK 把 bucket 塞到 hostname 出錯。
 *  4. presigned PUT 的 ContentType 必須跟前端 fetch PUT 的 Content-Type
 *     header 完全一致 (大小寫 / 空白都算)，否則 R2 回 SignatureDoesNotMatch。
 *
 * Hackathon 妥協: 不做 magic byte 檔案類型驗證、不做 virus scan、
 *                不做 dedup、不做 multipart upload (10MB 單檔夠了)。
 */

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';

// ---------- 環境變數 (lazy throw 比 top-level throw 對 build 友善) ----------
function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[r2-client] 缺少環境變數: ${name}`);
  return v;
}

// ---------- 允許的 image content types (whitelist) ----------
export const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export type AllowedContentType = (typeof ALLOWED_CONTENT_TYPES)[number];

export function isAllowedContentType(ct: string): ct is AllowedContentType {
  return (ALLOWED_CONTENT_TYPES as readonly string[]).includes(ct);
}

// ---------- 單檔大小上限 10MB ----------
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

// ---------- presigned URL TTL = 5 分鐘 ----------
const PRESIGN_TTL_SECONDS = 300;

// ---------- 副檔名對照 (key 結尾用) ----------
const EXT_BY_TYPE: Record<AllowedContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

// ---------- R2 client (singleton) ----------
// 注意: 在 Next.js dev hot reload 下會被重建多次，無傷大雅。
export const r2 = new S3Client({
  region: 'auto', // R2 必填 'auto'，不可改
  endpoint: env('R2_ENDPOINT'), // e.g. https://<account_id>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: env('R2_ACCESS_KEY_ID'),
    secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
  },
  forcePathStyle: true, // 避免某些 hostname-style 簽名問題
});

const BUCKET = () => env('R2_BUCKET');

// ---------- helpers ----------

/**
 * 簽出一個 5 分鐘有效的 PUT URL，前端可直接 fetch PUT 上傳。
 * key 格式: `{tenantId}/uploads/{uuid}.{ext}`
 *
 * 注意呼叫端必須把同樣的 contentType 傳給前端，前端 PUT 時的
 * `Content-Type` header 要 100% match，否則 R2 會 reject。
 */
export async function presignUpload(opts: {
  tenantId: string;
  contentType: string;
}): Promise<{ url: string; key: string }> {
  if (!isAllowedContentType(opts.contentType)) {
    throw new Error(`[r2-client] 不支援的 contentType: ${opts.contentType}`);
  }

  const ext = EXT_BY_TYPE[opts.contentType];
  const key = `${opts.tenantId}/uploads/${randomUUID()}.${ext}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET(),
    Key: key,
    ContentType: opts.contentType,
  });

  const url = await getSignedUrl(r2, cmd, { expiresIn: PRESIGN_TTL_SECONDS });
  return { url, key };
}

/**
 * 給 Inngest worker 用：抓 R2 物件回 Buffer 餵給 GPT-4o vision。
 * 注意: 大檔會吃記憶體，hackathon 只做 10MB 級別圖片，OK。
 */
export async function getR2ObjectBuffer(key: string): Promise<Buffer> {
  const res = await r2.send(
    new GetObjectCommand({ Bucket: BUCKET(), Key: key }),
  );
  if (!res.Body) throw new Error(`[r2-client] R2 物件不存在或為空: ${key}`);
  // SDK 在 Node 環境給 Readable stream，type 上有 transformToByteArray()
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * 寫回處理後的圖片 (e.g. resize / watermark 後的版本)。
 * Hackathon 暫時用不到，但留 API 給後續 pipeline 擴充。
 */
export async function uploadProcessedImage(
  key: string,
  buffer: Buffer,
  contentType: string,
): Promise<void> {
  await r2.send(
    new PutObjectCommand({
      Bucket: BUCKET(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );
}

/**
 * 把 R2 internal key 轉成 public URL (Cloudflare R2 public bucket)。
 * 給 UI / DB 存的就是這個 URL。
 */
export function publicUrlFor(key: string): string {
  const base = env('R2_PUBLIC_URL').replace(/\/$/, '');
  return `${base}/${key}`;
}
