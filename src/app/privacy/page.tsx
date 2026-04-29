/**
 * /privacy — 隱私權政策 (V1 #60, 約 500 字, 台灣個資法模板)
 */
import { LegalPageShell } from '@/components/platform/LegalPageShell';

export const metadata = {
  title: '隱私權政策 · Catalogify',
};

export default function PrivacyPage() {
  return (
    <LegalPageShell
      title="隱私權政策"
      subtitle="最後更新: 2026-04-29 · 適用於 Catalogify 平台所有用戶 (商家與顧客)"
    >
      <h2 className="text-base font-semibold text-zinc-900">1. 我們收集哪些資料</h2>
      <p>
        本平台依《個人資料保護法》規定, 僅在必要範圍內收集下列資料:
      </p>
      <ul className="ml-5 mt-2 list-disc space-y-1">
        <li><strong>商家</strong>: 店名、網址 slug、品牌語氣描述、上架商品照片與商品文案 (AI 生成或商家編輯)。</li>
        <li><strong>顧客</strong>: 結帳時填寫的 email、姓名、電話、收件地址、訂單明細。</li>
        <li><strong>系統</strong>: cookies (用於識別當前商家 session)、瀏覽器 user agent、IP 位址 (admin 登入紀錄)。</li>
      </ul>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">2. 使用目的</h2>
      <p>
        商家資料用於提供平台服務 (上架、訂單管理、資料分析)。 顧客資料用於完成商家訂單流程 (出貨、退款處理)。 系統資料用於平台運作與安全防護。
        除前述目的外, 不會將個資用於行銷或其他用途。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">3. 第三方分享</h2>
      <p>
        商家上架照片在 AI 文案生成過程中會傳送至 OpenAI 進行 vision 分析, 不會用於 OpenAI 模型訓練。 顧客個資僅分享給該訂單對應的商家用於出貨。 不對外販售或交換任何個資。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">4. Cookies</h2>
      <p>
        本平台使用 HttpOnly + Secure 屬性 cookie 保存 session 狀態 (商家身份、admin 登入)。 不使用第三方追蹤 cookie。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">5. 用戶權利</h2>
      <p>
        依個資法第 3 條, 您有權查詢、複本、補充更正、停止收集處理利用、刪除您的個資。 商家可在 /merchant/settings 自行修改商家資料; 顧客需透過下單商家或聯絡平台處理。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">6. 資料保存期限</h2>
      <p>
        商家資料於商家退出平台後 90 天內永久刪除。 訂單資料依《商業會計法》保存 5 年後刪除。 admin session cookies 於 24 小時後自動過期。
      </p>

      <h2 className="mt-6 text-base font-semibold text-zinc-900">7. 聯絡方式</h2>
      <p>
        如對本政策有疑問, 請透過 <a href="/about" className="text-zinc-900 underline">關於頁</a> 聯絡平台。 重大政策變更會在首頁公告 7 天。
      </p>
    </LegalPageShell>
  );
}
