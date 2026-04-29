#!/usr/bin/env tsx
/**
 * scripts/test-r2.ts — R2 presigned upload smoke test (Task #A4 子項)
 *
 * 用法:
 *   pnpm tsx scripts/test-r2.ts ./sample.jpg
 *
 * 流程:
 *   1. presignUpload() 取一個 5 分鐘 URL
 *   2. 用 fetch PUT 真的把檔案傳上 R2
 *   3. 印出 public URL，dashboard 應該看得到、瀏覽器也打得開
 *
 * 失敗時印 stack trace + 常見排查清單。
 */

import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

// 先載入 .env.local，讓 r2-client 拿得到環境變數
loadDotenv({ path: resolve(process.cwd(), '.env.local') });

import {
  presignUpload,
  publicUrlFor,
  type AllowedContentType,
} from '../src/lib/storage/r2-client';

const CONTENT_TYPE_BY_EXT: Record<string, AllowedContentType> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

async function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('用法: pnpm tsx scripts/test-r2.ts <path-to-image>');
    process.exit(1);
  }

  const absPath = resolve(process.cwd(), filePath);
  const ext = extname(absPath).toLowerCase();
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  if (!contentType) {
    console.error(`不支援的副檔名 ${ext}，請用 .jpg / .png / .webp`);
    process.exit(1);
  }

  const buffer = await readFile(absPath);
  console.log(`[1/3] 讀檔 OK: ${absPath} (${buffer.byteLength} bytes)`);

  // 用 demo akami tenant 簽
  const tenantId = '11111111-1111-1111-1111-111111111111';
  const { url, key } = await presignUpload({ tenantId, contentType });
  console.log(`[2/3] 簽 URL OK: key=${key}`);

  // PUT 直傳 — 注意 Content-Type 必須跟 sign 時一致
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`PUT 失敗 (HTTP ${res.status}): ${txt}`);
  }

  const publicUrl = publicUrlFor(key);
  console.log(`[3/3] 上傳 OK`);
  console.log(`R2 OK: ${publicUrl}`);
}

main().catch((err) => {
  console.error('\n❌ R2 smoke test 失敗:\n', err);
  console.error('\n常見排查:');
  console.error('  1. .env.local 是否齊全? (R2_ACCOUNT_ID/KEY/SECRET/BUCKET/ENDPOINT/PUBLIC_URL)');
  console.error('  2. R2_ENDPOINT 有沒有帶 https:// 前綴?');
  console.error('  3. API token 是否限定在這個 bucket 而且有 Read & Write?');
  console.error('  4. CORS 跟 PUT smoke test 無關 (CORS 只影響瀏覽器)，這層失敗是 credential 或 endpoint 問題。');
  process.exit(1);
});
