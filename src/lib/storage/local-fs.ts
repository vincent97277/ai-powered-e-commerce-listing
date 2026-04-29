/**
 * 本地檔案儲存 — 取代 R2 (hackathon local-first)
 *
 * 上傳路徑: ./public/uploads/{tenant_id}/{uuid}.{ext}
 * 公開 URL: /uploads/{tenant_id}/{uuid}.{ext} (Next.js 自動 serve public/)
 *
 * 為什麼不用 server signed URL？
 * - 本地不需要 — 前端直接 PUT 到 /api/uploads (server action 寫檔)
 * - 簡化 hackathon flow
 *
 * v2 升級到 R2 時，這個檔換掉就好，介面相同
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/** 確保 tenant 目錄存在 */
async function ensureDir(tenantId: string): Promise<string> {
  const dir = path.join(UPLOADS_DIR, tenantId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** 寫入檔案 (從 buffer)，回傳 storage key (例如 "akami/abc-123.jpg") */
export async function writeFileLocal(
  tenantId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  const ext = mimeToExt(contentType);
  const uuid = randomUUID();
  const key = `${tenantId}/${uuid}.${ext}`;

  await ensureDir(tenantId);
  await fs.writeFile(path.join(UPLOADS_DIR, key), buffer);

  return {
    key,
    publicUrl: `/uploads/${key}`,
  };
}

/** 給 Inngest worker 用：從 storage key 讀回 Buffer */
export async function readFileLocal(key: string): Promise<Buffer> {
  const filePath = path.join(UPLOADS_DIR, key);
  // 防 path traversal: 確認解析後路徑仍在 UPLOADS_DIR 下
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error(`[local-fs] Path traversal attempt: ${key}`);
  }
  return await fs.readFile(resolved);
}

/** 寫入處理過的版本 (e.g. 縮圖後的 webp) */
export async function writeProcessedLocal(
  tenantId: string,
  buffer: Buffer,
): Promise<{ key: string; publicUrl: string }> {
  const uuid = randomUUID();
  const key = `${tenantId}/processed/${uuid}.webp`;

  const fullDir = path.join(UPLOADS_DIR, tenantId, 'processed');
  await fs.mkdir(fullDir, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, key), buffer);

  return {
    key,
    publicUrl: `/uploads/${key}`,
  };
}

/** 取絕對 URL (給 GPT-4o vision call 用 — 它需要可從外部讀的 URL) */
export function getPublicUrl(key: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${baseUrl}/uploads/${key}`;
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
  };
  return map[mime] ?? 'jpg';
}
