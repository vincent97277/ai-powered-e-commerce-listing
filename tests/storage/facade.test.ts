/**
 * Storage facade tests — V2.2.4.
 *
 * Verifies that the dispatcher in src/lib/storage/index.ts picks the right
 * backend based on STORAGE_BACKEND env. Local backend tested end-to-end
 * with a real temp file. R2 backend tested via mocked S3 client.
 */
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as storage from '@/lib/storage';
import { _resetR2ClientForTesting } from '@/lib/storage/r2';

afterEach(() => {
  vi.unstubAllEnvs();
  storage._resetStorageBackendForTesting();
  _resetR2ClientForTesting();
  vi.restoreAllMocks();
});

describe('storage facade — backend selection', () => {
  it('defaults to local when STORAGE_BACKEND is unset', () => {
    vi.stubEnv('STORAGE_BACKEND', '');
    storage._resetStorageBackendForTesting();
    expect(storage.activeBackend()).toBe('local');
  });

  it('selects local when STORAGE_BACKEND=local', () => {
    vi.stubEnv('STORAGE_BACKEND', 'local');
    storage._resetStorageBackendForTesting();
    expect(storage.activeBackend()).toBe('local');
  });

  it('selects r2 when STORAGE_BACKEND=r2', () => {
    vi.stubEnv('STORAGE_BACKEND', 'r2');
    storage._resetStorageBackendForTesting();
    expect(storage.activeBackend()).toBe('r2');
  });
});

describe('storage facade — local backend round-trip', () => {
  const TENANT = '99999999-tttt-tttt-tttt-test444444444';

  beforeEach(() => {
    vi.stubEnv('STORAGE_BACKEND', 'local');
    storage._resetStorageBackendForTesting();
  });

  it('writeFile + readFile preserves bytes', async () => {
    const data = Buffer.from('hello-storage');
    const { key, publicUrl } = await storage.writeFile(TENANT, data, 'image/jpeg');
    try {
      expect(key).toMatch(new RegExp(`^${TENANT}/[a-f0-9-]+\\.jpg$`));
      expect(publicUrl).toBe(`/uploads/${key}`);
      const read = await storage.readFile(key);
      expect(read.equals(data)).toBe(true);
    } finally {
      await fs.unlink(path.join(process.cwd(), 'public/uploads', key)).catch(() => {});
    }
  });

  it('writeProcessed writes .webp under processed/', async () => {
    const { key, publicUrl } = await storage.writeProcessed(TENANT, Buffer.from('webp-bytes'));
    try {
      expect(key).toMatch(new RegExp(`^${TENANT}/processed/[a-f0-9-]+\\.webp$`));
      expect(publicUrl).toBe(`/uploads/${key}`);
    } finally {
      await fs.unlink(path.join(process.cwd(), 'public/uploads', key)).catch(() => {});
    }
  });

  it('getPublicUrl returns absolute URL using NEXT_PUBLIC_APP_URL', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://example.com');
    storage._resetStorageBackendForTesting();
    expect(storage.getPublicUrl('foo/bar.jpg')).toBe('https://example.com/uploads/foo/bar.jpg');
  });

  it('readFile rejects path traversal', async () => {
    await expect(storage.readFile('../../etc/passwd')).rejects.toThrow(/path traversal/);
  });
});

describe('storage facade — r2 backend (mocked S3 client)', () => {
  beforeEach(() => {
    vi.stubEnv('STORAGE_BACKEND', 'r2');
    vi.stubEnv('R2_ENDPOINT', 'https://test.r2.cloudflarestorage.com');
    vi.stubEnv('R2_ACCESS_KEY_ID', 'AKIA-test');
    vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret-test');
    vi.stubEnv('R2_BUCKET', 'test-bucket');
    vi.stubEnv('R2_PUBLIC_URL', 'https://test-bucket.r2.dev');
    storage._resetStorageBackendForTesting();
    _resetR2ClientForTesting();
  });

  it('writeFile sends PutObjectCommand and returns absolute publicUrl', async () => {
    const sendSpy = vi.fn().mockResolvedValue({});
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(sendSpy);

    const tenantId = 'tenant-r2';
    const data = Buffer.from('image-bytes');
    const { key, publicUrl } = await storage.writeFile(tenantId, data, 'image/png');

    expect(key).toMatch(new RegExp(`^${tenantId}/[a-f0-9-]+\\.png$`));
    expect(publicUrl).toBe(`https://test-bucket.r2.dev/${key}`);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const cmd = sendSpy.mock.calls[0][0];
    expect(cmd.input.Bucket).toBe('test-bucket');
    expect(cmd.input.Key).toBe(key);
    expect(cmd.input.ContentType).toBe('image/png');
  });

  it('readFile sends GetObjectCommand and returns Buffer from byte stream', async () => {
    const sendSpy = vi.fn().mockResolvedValue({
      Body: {
        transformToByteArray: async () => new Uint8Array([1, 2, 3, 4]),
      },
    });
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(sendSpy);

    const out = await storage.readFile('tenant/abc.jpg');
    expect(out.equals(Buffer.from([1, 2, 3, 4]))).toBe(true);
  });

  it('readFile rejects unsafe key', async () => {
    await expect(storage.readFile('../escape')).rejects.toThrow(/unsafe key/);
  });

  it('writeProcessed writes processed/<uuid>.webp', async () => {
    const sendSpy = vi.fn().mockResolvedValue({});
    const { S3Client } = await import('@aws-sdk/client-s3');
    vi.spyOn(S3Client.prototype, 'send').mockImplementation(sendSpy);

    const { key, publicUrl } = await storage.writeProcessed('t1', Buffer.from('webp'));
    expect(key).toMatch(/^t1\/processed\/[a-f0-9-]+\.webp$/);
    expect(publicUrl).toBe(`https://test-bucket.r2.dev/${key}`);
    const cmd = sendSpy.mock.calls[0][0];
    expect(cmd.input.ContentType).toBe('image/webp');
  });

  it('getPublicUrl returns the R2_PUBLIC_URL-prefixed URL', () => {
    expect(storage.getPublicUrl('foo/bar.jpg')).toBe(
      'https://test-bucket.r2.dev/foo/bar.jpg',
    );
  });

  it('throws clear error when R2 env is missing', async () => {
    vi.stubEnv('R2_BUCKET', '');
    _resetR2ClientForTesting();
    storage._resetStorageBackendForTesting();
    await expect(storage.writeFile('t', Buffer.from('x'), 'image/jpeg')).rejects.toThrow(
      /R2_BUCKET/,
    );
  });
});
