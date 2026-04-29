/**
 * /terms — 服務條款 (V1 #60, 約 500 字)
 */
import { LegalPageShell } from '@/components/platform/LegalPageShell';

export const metadata = {
  title: '服務條款 · Catalogify',
};

export default function TermsPage() {
  return (
    <LegalPageShell
      title="服務條款"
      subtitle="最後更新: 2026-04-29 · 您使用 Catalogify 平台即視為同意本條款"
    >
      <h2 className="text-base font-semibold text-zinc-900">1. 服務性質</h2>
      <p>
        Catalogify 是多商家電商平台, 提供商家上架商品、AI 文案輔助、訂單管理、storefront 公開展示等功能。 平台本身不直接銷售商品, 商品由各進駐商家自行銷售並負完整責任。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">2. 帳號責任</h2>
      <p>
        商家應妥善保管登入憑證, 不得將帳號分享給第三方。 因密碼外洩或操作失誤造成的訂單損失由商家自行承擔。 V1 版本商家身份以 cookie 識別, 切勿在公用裝置上長時間保留 session。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">3. 商家責任</h2>
      <p>
        商家對自己上架的商品內容、標價、出貨、客服全權負責。 不得上架以下品項: 違法商品 (毒品、武器、未授權智財商品)、違反公序良俗商品、不實宣傳商品、含個資的商品圖。 平台保留下架違規商品與停權違規商家的權利。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">4. 平台責任</h2>
      <p>
        平台盡力提供穩定服務但不保證 100% uptime。 對因系統異常、AI 文案誤生成、第三方 API 故障 (例如 OpenAI 服務中斷) 造成的損失, 平台僅在直接因平台過失範圍內負責, 賠償上限以商家當月實際支付平台費用為限 (V1 階段不收費, 故賠償上限為 NT$0)。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">5. 違規處理</h2>
      <p>
        平台發現商家違反本條款 (含但不限於上架違規商品、惡意刷單、騷擾顧客) 可採取下列措施: (a) 警告並要求改善; (b) 暫停帳號; (c) 永久終止帳號; (d) 必要時報請執法機關處理。 商家被停權後, storefront 顯示「暫停營業中」, 商家後台仍可處理 in-flight 訂單但無法上架新商品。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">6. 終止條款</h2>
      <p>
        商家可隨時透過 /merchant/settings 提出退出平台申請, 平台於確認無未完成訂單後處理。 平台保留調整服務內容、終止服務的權利, 重大變更將提前 30 天於平台首頁公告。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">7. 適用法律</h2>
      <p>
        本條款適用中華民國 (台灣) 法律。 因本條款衍生爭議以台灣台北地方法院為第一審管轄法院。
      </p>
    </LegalPageShell>
  );
}
