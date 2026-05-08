/**
 * Product photo upload endpoint
 * Client POSTs FormData → server writes to public/uploads/{tenant}/{uuid}.ext
 *
 * V1 limitations:
 * - No magic-byte file-type verification
 * - No file dedup
 * - No virus scan
 * - 10MB / image-only cap
 */
import { NextRequest, NextResponse } from 'next/server';
import { writeFile } from '@/lib/storage';
import { resolveMerchantFromCookie } from '@/lib/storage/resolve-merchant';

export const runtime = 'nodejs';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    // V2 task 105: cookie → merchant lookup is unified via resolveMerchantFromCookie() (reads merchant-session cookie)
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
    const { key, publicUrl } = await writeFile(
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
    // V2.3.3: propagate Next.js redirect signals (resolveMerchantFromCookie
    // calls redirect() when cookie missing/invalid). Without this, an
    // unauthenticated POST returns 500 instead of 307 → /merchant/login.
    // Smoke test caught the regression.
    if (
      err instanceof Error &&
      (err.message === 'NEXT_REDIRECT' ||
        (err as { digest?: string }).digest?.startsWith?.('NEXT_REDIRECT'))
    ) {
      throw err;
    }
    console.error('[/api/uploads] error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '上傳失敗' },
      { status: 500 },
    );
  }
}
