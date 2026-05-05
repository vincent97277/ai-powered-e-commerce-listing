/**
 * Cloudflare R2 storage backend — V2.2.4.
 *
 * Drop-in replacement for src/lib/storage/local-fs.ts when running on a
 * serverless platform (Vercel / Cloud Run) where the local filesystem is
 * read-only / per-invocation ephemeral.
 *
 * Configured via env vars (validated by src/lib/env.ts when STORAGE_BACKEND=r2):
 *   R2_ENDPOINT          — https://<account_id>.r2.cloudflarestorage.com
 *   R2_ACCESS_KEY_ID     — R2 access key
 *   R2_SECRET_ACCESS_KEY — R2 secret
 *   R2_BUCKET            — bucket name
 *   R2_PUBLIC_URL        — https://<bucket>.<account>.r2.dev (or custom domain)
 *
 * Contract matches local-fs:
 *   writeFile(tenantId, buffer, contentType) → { key, publicUrl }
 *   readFile(key) → Buffer
 *   writeProcessed(tenantId, buffer) → { key, publicUrl }  // .webp
 *   getPublicUrl(key) → absolute URL (used by Inngest worker for OpenAI vision)
 *
 * Differences from local-fs:
 *   - publicUrl is an absolute URL (R2 public bucket), not a /uploads/... relative
 *   - Path traversal isn't a worry on R2 (bucket scope), but we still validate
 *     keys to fail-fast on malformed input
 *   - Reads use streaming → buffer (R2 SDK exposes transformToByteArray)
 */
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'node:crypto';

let _client: S3Client | null = null;

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[storage/r2] missing env: ${name}`);
  return v;
}

function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: 'auto',
    endpoint: env('R2_ENDPOINT'),
    credentials: {
      accessKeyId: env('R2_ACCESS_KEY_ID'),
      secretAccessKey: env('R2_SECRET_ACCESS_KEY'),
    },
    forcePathStyle: true,
  });
  return _client;
}

function bucket(): string {
  return env('R2_BUCKET');
}

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function mimeToExt(mime: string): string {
  return EXT_BY_TYPE[mime] ?? 'jpg';
}

function assertSafeKey(key: string): void {
  // Reject path traversal / leading slash / absolute paths; allowed: tenant_id/uuid.ext
  if (key.includes('..') || key.startsWith('/') || key.startsWith('\\')) {
    throw new Error(`[storage/r2] unsafe key: ${key}`);
  }
}

export async function writeFile(
  tenantId: string,
  buffer: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  const ext = mimeToExt(contentType);
  const uuid = randomUUID();
  const key = `${tenantId}/${uuid}.${ext}`;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return { key, publicUrl: getPublicUrl(key) };
}

export async function readFile(key: string): Promise<Buffer> {
  assertSafeKey(key);
  const res = await client().send(
    new GetObjectCommand({ Bucket: bucket(), Key: key }),
  );
  if (!res.Body) throw new Error(`[storage/r2] object not found or empty: ${key}`);
  const bytes = await res.Body.transformToByteArray();
  return Buffer.from(bytes);
}

export async function writeProcessed(
  tenantId: string,
  buffer: Buffer,
): Promise<{ key: string; publicUrl: string }> {
  const uuid = randomUUID();
  const key = `${tenantId}/processed/${uuid}.webp`;

  await client().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
    }),
  );

  return { key, publicUrl: getPublicUrl(key) };
}

export function getPublicUrl(key: string): string {
  const base = env('R2_PUBLIC_URL').replace(/\/$/, '');
  return `${base}/${key}`;
}

/** Test-only: reset client cache so vi.stubEnv changes take effect. */
export function _resetR2ClientForTesting(): void {
  _client = null;
}
