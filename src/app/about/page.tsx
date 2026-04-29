/**
 * /about — 關於 Catalogify (V1 #60)
 * 約 200 字
 */
import { LegalPageShell } from '@/components/platform/LegalPageShell';

export const metadata = {
  title: '關於 Catalogify',
  description: '為獨立小店蓋的多商家電商平台',
};

export default function AboutPage() {
  return (
    <LegalPageShell title="關於 Catalogify" subtitle="為獨立小店蓋的多商家電商平台">
      <p>
        Catalogify 是一個讓獨立小店快速進駐、靠 AI 把上架時間從 1 小時砍到 60 秒的電商平台。
        對店主來說, 拍一張照片就能生出商品標題 / 描述 / SEO 標籤 / 變體 / 建議定價, 再順手匯出蝦皮上架 CSV — 不用切換十個工具,
        所有流程一條龍。
      </p>
      <h2 className="mt-6 text-base font-semibold text-zinc-900">為什麼要做這個</h2>
      <p>
        台灣有非常多小店主白天接單晚上拍照, 上架前要在 Notion / Excel / 蝦皮後台之間切換半天 — 把這段時間還給他們, 才有空把產品做好。
        我們把 GPT-4o vision 跟商家的品牌語氣結合, 文案不是 AI 罐頭, 而是商家自己的口吻。
      </p>
      <h2 className="mt-6 text-base font-semibold text-zinc-900">怎麼開始</h2>
      <p>
        到{' '}
        <a href="/onboarding" className="text-zinc-900 underline">
          開店頁
        </a>
        {' '}填三個欄位 (店名 / 網址 / 品牌語氣), 30 秒後就有自己的店面了。
      </p>
    </LegalPageShell>
  );
}
