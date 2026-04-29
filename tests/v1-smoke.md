# V1 Smoke Test Checklist

跑時機: V1 收斂前必跑一遍. 任一條失敗 → V1 不算 done.
跑法: 每條 manual 點一下 + verify, 預計 10-15 分鐘.

## 平台首頁 (Phase 5)

- [ ] **#1** `/` 載入, hero「為獨立小店蓋的電商平台」+ 2 CTA + 熱門店鋪 6 張 + footer 連 about/privacy/terms
- [ ] **#2** 點任一店鋪 → 進 `/store/{slug}`, 看到該商家 brand-primary 配色 + 商品列表

## Storefront → Order (Phase 4)

- [ ] **#3** 加 1 商品到購物車, checkout 填 email/phone/姓名/地址 → 送出 → 看到 confirmation page (`/store/{slug}/order/{id}`)
- [ ] **#4** 切到 merchant 後台 (cookie 切該商家 id), dashboard 頂部「⚡ 待處理」 callout 顯示「1 筆待付款」chip
- [ ] **#5** 點待付款 chip → 跳到 `/merchant/orders?status=pending`, 1 筆訂單可見
- [ ] **#6** 點該筆訂單 → detail page 看到完整顧客資訊
- [ ] **#7** 切「待付款 → 已付款」, status timeline 出現一筆
- [ ] **#8** 切「已付款 → 已出貨」, 填物流商「711」單號「12345」, audit timeline 第二筆
- [ ] **#9** 點「列印出貨單」 → 印出商家名 / 顧客資訊 / 訂單明細 / 總額
- [ ] **#10** 切「已出貨 → 已完成」, 訂單流程 closed

## Admin Backend (Phase 3)

- [ ] **#11** 訪 `/admin` 沒 cookie → 302 to `/admin/login`
- [ ] **#12** `/admin/login` 輸對 password → set cookie + redirect to `/admin`
- [ ] **#13** `/admin` 看到 4 KPI + 商家排行 (該商家 GMV +1)
- [ ] **#14** 點商家 row → `/admin/merchants/[id]` detail page (KPI + 商品/訂單 tabs + audit log column)
- [ ] **#15** 點「停權」+ 填理由 → 確認, audit log 出現一筆
- [ ] **#16** 公開 `/store/{slug}` 顯示「暫停營業中」(200 OK)
- [ ] **#17** 商家後台 banner「已被平台暫停」+ 嘗試上架 → 403
- [ ] **#18** Admin 點「啟用」 → 一切恢復
- [ ] **#19** Admin 點「強制改 slug」 改成新 slug → `/store/{old}` 301 → `/store/{new}` (cache TTL 5 min, 重啟 dev 加速)

## AI Import (Phase 6)

- [ ] **#20** 貼一個亂的 URL (e.g. `https://evil.com/x`) 到 `/merchant/products/import` → 看到清楚錯誤訊息「URL 不在支援的 source 範圍」 (不爆 stack trace)
- [ ] **#21** 貼 IG / 蝦皮真實連結 (需有 Inngest dev 跑) → 1 秒內 redirect 到 progress 頁 → 0/N → N/N streaming 進度
- [ ] **#22** Import 完成後商品列表多 N 件商品, 文案是商家 brand voice 風格 (不是 IG 原文)
- [ ] **#23** 同一個 IG 連結 import 兩次 (5 分鐘內) → 第二次 idempotency 命中, 同 sessionId

## Cross-cutting

- [ ] **#24** `grep -ri hackathon src/` 為 0 (除 .legacy)
- [ ] **#25** Footer 三件套 `/about` `/privacy` `/terms` 全 200, 各有實際內容

## Automated (run by CI / vitest)

- [x] vitest: 40 tests pass (RLS x8 + admin-auth x14 + url-guard x15 + IG x5 + Shopee x3)
- [x] tsc --noEmit clean
- [x] next lint clean
- [x] Migration forward + rollback + forward idempotent (`drizzle/migrations/0001/0002/0003`)

## 跑前檢查

- [ ] DB migrations 0001/0002/0003 已 apply
- [ ] `.env.local` 含 `ADMIN_PASSWORD` + `ADMIN_SESSION_SECRET` (≥32 chars)
- [ ] Dev server 跑 (`bun run dev`)
- [ ] (可選) Inngest dev CLI 跑 (`bunx inngest-cli@latest dev -u http://localhost:3000/api/inngest`)

## 跑完結果

跑完日期: ____________
跑完結果: ____ / 25
失敗項: ____________
備註: ____________
