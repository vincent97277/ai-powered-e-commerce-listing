/**
 * Local filesystem storage backend.
 *
 * Used in dev (and tests) when STORAGE_BACKEND is unset or 'local'. Writes
 * to ./public/uploads/{tenant_id}/{uuid}.{ext}; reads via fs.readFile.
 *
 * V2.2.4: function names lost the `Local` suffix to match the unified
 * storage facade in src/lib/storage/index.ts. Behavior unchanged.
 *
 * Why not in prod: serverless runtimes (Vercel functions, Cloud Run) have
 * read-only or per-invocation filesystems — anything written here is
 * unreachable from the next invocation. Use STORAGE_BACKEND=r2 in prod.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function mimeToExt(mime: string): string {
  return EXT_BY_TYPE[mime] ?? 'jpg';
}

async function ensureDir(tenantId: string): Promise<string> {
  const dir = path.join(UPLOADS_DIR, tenantId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

export async function writeFile(
  tenantId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  const ext = mimeToExt(contentType);
  const uuid = randomUUID();
  const key = `${tenantId}/${uuid}.${ext}`;

  await ensureDir(tenantId);
  await fs.writeFile(path.join(UPLOADS_DIR, key), buffer);

  return { key, publicUrl: `/uploads/${key}` };
}

export async function readFile(key: string): Promise<Buffer> {
  // V2.2.11: explicit guard so a malformed event payload gets a clear error
  // instead of a path.join TypeError or a path-traversal false positive.
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error(
      `[storage/local-fs] key must be a non-empty string (got ${typeof key === 'string' ? '<empty>' : typeof key})`,
    );
  }
  const filePath = path.join(UPLOADS_DIR, key);
  // Path traversal guard: resolved path must stay inside UPLOADS_DIR.
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(UPLOADS_DIR))) {
    throw new Error(`[storage/local-fs] path traversal attempt: ${key}`);
  }
  return await fs.readFile(resolved);
}

export async function writeProcessed(
  tenantId: string,
  buffer: Buffer,
): Promise<{ key: string; publicUrl: string }> {
  const uuid = randomUUID();
  const key = `${tenantId}/processed/${uuid}.webp`;

  const fullDir = path.join(UPLOADS_DIR, tenantId, 'processed');
  await fs.mkdir(fullDir, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, key), buffer);

  return { key, publicUrl: `/uploads/${key}` };
}

export function getPublicUrl(key: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
  return `${baseUrl}/uploads/${key}`;
}
