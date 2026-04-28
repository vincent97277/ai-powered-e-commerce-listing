/**
 * 根目錄首頁 — Hackathon demo 階段直接導去商家後台
 */
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="max-w-2xl px-6 text-center space-y-6">
        <h1 className="text-5xl font-bold" style={{ fontFamily: 'var(--brand-font-heading)' }}>
          Catalogify
        </h1>
        <p className="text-lg text-neutral-600">
          1 張照片 → 7 件事 → 60 秒
        </p>
        <p className="text-sm text-neutral-500">
          標題 / 描述 / SEO / 去背圖 / 變體 / 定價 / 蝦皮規格
        </p>
        <div className="flex justify-center gap-4 pt-4">
          <Link
            href="/merchant/products/new"
            className="px-6 py-3 rounded font-medium"
            style={{ backgroundColor: 'var(--brand-primary)', color: 'white' }}
          >
            進入商家後台 →
          </Link>
          <Link
            href="/store/akami"
            className="px-6 py-3 border rounded font-medium"
            style={{ borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' }}
          >
            查看 storefront
          </Link>
        </div>
      </div>
    </main>
  );
}
