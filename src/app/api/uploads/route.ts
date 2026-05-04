/**
 * 商品照片上傳 endpoint
 * 前端 POST FormData → server 寫到 public/uploads/{tenant}/{uuid}.ext
 *
 * V1 限制:
 * - 不做 magic byte 檔案類型驗證
 * - 不做 file dedup
 * - 不做 virus scan
 * - 限制 10MB / 圖片類型
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFileLocal } from '@/lib/storage/local-fs';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';

export const runtime = 'nodejs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    // V2 task 105: cookie → merchant 已統一走 resolveMerchantFromCookie() (讀 merchant-session cookie)
    const merchant = await resolveMerchantFromCookie();

    const formData = await req.formData();
    const file = formData.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少 file' }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `不支援的檔案類型: ${file.type}` },
        { status: 400 },
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `檔案過大 (${file.size} > ${MAX_SIZE})` },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const { key, publicUrl } = await writeFileLocal(
      merchant.tenantId,
      buffer,
      file.type,
    );

    return NextResponse.json({
      success: true,
      key,
      publicUrl,
      size: file.size,
    });
  } catch (err) {
    console.error('[/api/uploads] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上傳失敗' },
      { status: 500 },
    );
  }
}
