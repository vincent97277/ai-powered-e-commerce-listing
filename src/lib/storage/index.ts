/**
 * Storage facade — V2.2.4.
 *
 * Single entry point for image storage operations. Dispatches to the active
 * backend based on STORAGE_BACKEND env var:
 *   - STORAGE_BACKEND=local (default) → src/lib/storage/local-fs.ts
 *   - STORAGE_BACKEND=r2              → src/lib/storage/r2.ts
 *
 * Why a facade: every call site (api/uploads, api/products/generate,
 * inngest worker, import downloader) used to import from local-fs directly.
 * Going to prod required swapping all those imports OR introducing this
 * dispatch layer. Dispatch is cheaper to maintain.
 *
 * Backend selection happens at module load (process.env read once). Tests
 * can call _resetForTesting() between cases.
 *
 * Contract:
 *   writeFile(tenantId, buffer, contentType) → { key, publicUrl }
 *   readFile(key) → Buffer
 *   writeProcessed(tenantId, buffer) → { key, publicUrl }   // .webp
 *   getPublicUrl(key) → absolute URL (Inngest worker → OpenAI vision)
 *
 * Note on publicUrl shape:
 *   - local backend: relative `/uploads/...` for browser display, but
 *     getPublicUrl() returns an absolute URL using NEXT_PUBLIC_APP_URL
 *     so the OpenAI vision call can fetch.
 *   - r2 backend: writeFile already returns an absolute R2 URL, identical
 *     to getPublicUrl(). Less duality.
 */
import * as local from './local-fs';
import * as r2 from './r2';

type Backend = {
  writeFile: typeof local.writeFile;
  readFile: typeof local.readFile;
  writeProcessed: typeof local.writeProcessed;
  getPublicUrl: typeof local.getPublicUrl;
};

let _backend: Backend | null = null;

function pickBackend(): Backend {
  if (_backend) return _backend;
  const choice = process.env.STORAGE_BACKEND === 'r2' ? r2 : local;
  _backend = {
    writeFile: choice.writeFile,
    readFile: choice.readFile,
    writeProcessed: choice.writeProcessed,
    getPublicUrl: choice.getPublicUrl,
  };
  return _backend;
}

export const writeFile: Backend['writeFile'] = (...args) => pickBackend().writeFile(...args);
export const readFile: Backend['readFile'] = (...args) => pickBackend().readFile(...args);
export const writeProcessed: Backend['writeProcessed'] = (...args) =>
  pickBackend().writeProcessed(...args);
export const getPublicUrl: Backend['getPublicUrl'] = (...args) => pickBackend().getPublicUrl(...args);

/** Test-only: clear cached backend so vi.stubEnv changes take effect. */
export function _resetStorageBackendForTesting(): void {
  _backend = null;
}

/** Inspectable for tests / health checks. */
export function activeBackend(): 'local' | 'r2' {
  return process.env.STORAGE_BACKEND === 'r2' ? 'r2' : 'local';
}
