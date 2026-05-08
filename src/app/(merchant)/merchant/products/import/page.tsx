/**
 * /merchant/products/import — IG/Shopee one-click import entry (V1 #68)
 * Merchant pastes link + selects kind → POST /api/products/import → redirect to progress page
 */
import { ImportForm } from './ImportForm';

export const dynamic = 'force-dynamic';

export default function MerchantImportPage() {
  return (
    <main
      className="min-h-screen px-12 py-10"
      style={{ backgroundColor: 'var(--brand-bg)', color: 'var(--brand-text)' }}
    >
      <div className="mx-auto max-w-2xl space-y-8">
        <header>
          <p className="t-caption" style={{ color: 'var(--brand-primary)' }}>
            一鍵 import
          </p>
          <h1 className="t-h1" style={{ fontFamily: 'var(--brand-font-heading)' }}>
            從 IG / 蝦皮搬商品過來
          </h1>
          <p className="t-small mt-1 opacity-60">
            貼一個 IG 帳號 / 商品 / 蝦皮店面或商品連結, AI 60 秒幫你重寫成你的品牌語氣
          </p>
        </header>

        <ImportForm />

        <section
          className="rounded p-5 text-sm"
          style={{
            backgroundColor: 'color-mix(in srgb, var(--brand-primary) 4%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--brand-primary) 16%, transparent)',
            borderRadius: 'var(--brand-radius)',
          }}
        >
          <p className="font-medium opacity-80">運作方式</p>
          <ol className="mt-2 ml-5 list-decimal space-y-1 opacity-70">
            <li>抓 IG / 蝦皮頁面 metadata + JSON-LD (5-20 件商品)</li>
            <li>下載每件商品圖到本地 (5MB cap, 序列下載避免 OOM)</li>
            <li>每件商品丟 GPT-4o vision, 用<strong>你的品牌語氣</strong>重寫文案</li>
            <li>結束後一次出現在你的商品列表, 你再決定上不上架</li>
          </ol>
          <p className="mt-3 text-xs opacity-50">
            私人帳號 / 蝦皮有些商品結構限制 → 抓不到時會 graceful fallback, 你可以改用單張上傳。
          </p>
        </section>
      </div>
    </main>
  );
}
