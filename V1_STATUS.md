# V1 Status — demo-sass-2

> 為獨立小店蓋的多商家電商平台. 版本: V1 (2026-04-30 收斂).
> 本文件: 流程, 現況, 未來. 適合接手或續做 V2 的人.

---

## 1. 流程規劃 (How V1 Was Built)

V1 從 hackathon prototype 收斂為可營運平台. 用 gstack 4-skill review pipeline + agency-agents role review 確保 scope/architecture/design/code 四個面向都對齊, 然後拆 7 phases 漸進實作.

### 1.1 Review pipeline (動工前)

| 階段 | 工具 | 產出 |
|------|------|------|
| Brainstorming | `/office-hours` | 鎖 V1 主軸: 多商家平台 + admin + AI import + 半生不熟 feature 補完 |
| 策略 / scope | `/plan-ceo-review` | V1 in / TODOS deferred 切割 (例: GTM kit, 分潤, search 全 deferred) |
| 架構 | `/plan-eng-review` | RLS via JOIN, hostname allowlist SSRF, optimistic concurrency, dbAdmin 隔離 |
| 設計 | `/plan-design-review` | Linear-tone 平台 palette, brand-aware storefront, A4 print CSS |
| Final review | `/review` | 7 phases 拆解 + 任務清單 |
| Role audit | agency-agents | engineering-handoff-specs 完整 cross-check |

### 1.2 7 Phases (動工後)

每個 phase 做完跑 type-check + lint + 對應 unit/e2e tests, 然後 git commit. 7 個 phase 對應 7 個 git commit:

1. **Phase 1** — Schema migrations (16 columns + 4 tables + RLS WITH CHECK)
2. **Phase 2** — Admin auth (HMAC cookie + middleware + Edge runtime split)
3. **Phase 3** — Admin backend (overview + merchant detail + suspend/activate/rename + storefront banner + previousSlug 301)
4. **Phase 4** — Order lifecycle (detail page + status flip + 列印 + 列表 filter)
5. **Phase 5** — Platform UI (marketplace 首頁 + about/privacy/terms + hackathon 字樣全清)
6. **Phase 6** — AI import (SSRF defense + IG/Shopee parsers + Inngest worker + UI)
7. **Phase 7** — Polish + tests (庫存/設定/PendingCallout + 36 integration tests + RLS e2e 擴充)

### 1.3 安全與品質規則 (持續適用 V2)

- **dbAdmin 必須過 ESLint allowlist** (`eslint.config.mjs` no-restricted-imports). 業務寫入用 `withTenantTx` + RLS.
- **每張新表必須有 RLS policy 含 WITH CHECK**, 避免 cross-tenant insert.
- **外連 fetch 必須過 `assertSafeUrl()`** (hostname allowlist, 不用 regex).
- **狀態翻轉必須 optimistic concurrency** (`WHERE status = expected`, 檢 rowCount).
- **Server actions 用 `.bind(null, args)` pattern**, 不要在 async server component 內 dynamic `await import()` 加內聯 `'use server'`.

---

## 2. 現在到哪裡 (V1 Surface)

### 2.1 已 ship 的 feature surface

**對顧客 (公開 storefront)**
- `/` 平台首頁: hero + 熱門 6 商家 + footer 三件套
- `/store/{slug}` 商家頁: brand color/font/radius 注入, 商品列表
- `/store/{slug}/checkout` + `/store/{slug}/order/{id}` 下單 + confirmation
- 商家暫停 → storefront 顯示「暫停營業中」(200 OK, 不是 404)
- 商家改 slug → 舊 slug 301 → 新 slug

**對商家 (`/merchant/*`)**
- Dashboard: 4 KPI + 待處理 callout (3 chip)
- 商品 CRUD + AI 拍照建檔 + 庫存欄 + 低庫存 filter + 排序
- 訂單列表 + status filter + detail page (顧客資訊 / items / 內部備註)
- 訂單 status flow: 待付款 → 已付款 → 已出貨 (填物流商/單號) → 已完成 / 退款
- 列印出貨單 (A4 print CSS)
- 設定: brand color/font/radius + lowStockThreshold + dailyAiCostCentsCap
- AI import: 貼 IG / 蝦皮連結 → Inngest 背景跑 → progress streaming

**對平台 admin (`/admin/*`)**
- HMAC signed cookie + DB-backed revocable session
- Overview: 4 KPI + 商家排行 (sortable by GMV)
- Merchant detail: KPI / 商品 / 訂單 / audit log
- Actions: 停權 / 啟用 / 強制改 slug (atomic tx, 原子寫 audit log)

**安全防線**
- RLS multi-tenant 隔離 (web_anon role, BYPASSRLS 隔離在 dbAdmin)
- SSRF: hostname allowlist + DNS rebinding 重驗 + private IP 黑名單 + redirect 手動 follow
- Admin auth fail-closed: 缺 env → 503, 缺 cookie → 307, 假 cookie → 307

### 2.2 測試覆蓋

| 種類 | 數量 | 檔案 |
|------|------|------|
| RLS e2e | 8 | `tests/rls.e2e.test.ts` |
| Admin auth e2e | 14 | `tests/admin-auth.e2e.test.ts` |
| URL guard / SSRF | 15 | `tests/import/url-guard.test.ts` |
| IG fetcher | 5 | `tests/import/ig-fetcher.test.ts` |
| Shopee fetcher | 3 | `tests/import/shopee-fetcher.test.ts` |
| V1 integration | 36 | `tests/v1-integration.test.ts` |
| Manual smoke | 25 條 | `tests/v1-smoke.md` |

未跑: 真實 OpenAI vision call (有 GPT-4o smoke script 但需 API key + 金流).

### 2.3 已知限制

- **No real payment gateway** — checkout 走「客服收款」flow (待付款 status 由商家手動翻).
- **No real shipping integration** — 物流商/單號是純文字, 沒接 7-11 / 黑貓 API.
- **No email/SMS notifications** — status 變更不寄通知, 僅 audit log 寫入.
- **AI import 需 OpenAI API key + Inngest dev server** 才能 e2e (本機可跑, 需手動啟 `bunx inngest-cli dev`).
- **R2 / Vercel / Neon 沒部署** — 本機 docker postgres + 本機 filesystem upload, prod 上線要切回 cloud.

---

## 3. 未來做什麼 (V2 Candidates)

按 ICE 排序 (Impact × Confidence ÷ Effort), 每個都有「為什麼 V1 沒做」的記錄.

### 3.1 P0 (V2 開頭 1-2 週)

| Item | Why deferred from V1 | What it needs |
|------|---------------------|---------------|
| **金流串接 (綠界/藍新/Stripe TW)** | V1 鎖在「商家自收」, hackathon 評審不看金流 | 1 個 provider 串到底, webhook 對到 paid status, 退款打回 |
| **Email 通知 (訂單成立/出貨/退款)** | V1 鎖在 audit log only | Resend 或 SendGrid + 4 個 template + opt-out |
| **真 OpenAI key + Inngest cloud** | V1 跑本機 dev | 2 個環境變數 + Vercel deploy + cost monitoring (V1 已有 `dailyAiCostCentsCap` 欄位但沒接 enforcement) |
| **部署 (Vercel + Neon + R2)** | V1 跑 docker 本機 | env migration plan, prod RLS role 重建, 圖片從 local → R2 |

### 3.2 P1 (V2 中段 3-4 週)

| Item | Notes |
|------|-------|
| **物流串接 (7-11 / 黑貓)** | 開單 + 取得單號 + tracking webhook |
| **商家分潤 / 平台抽成** | merchants table 加 commission_bps, 訂單完成後計算 platform_revenue |
| **顧客帳號 (optional)** | V1 是 guest checkout, V2 加會員 = 訂單歷史 + 收貨地址簿 |
| **Search (商品 / 商家)** | V1 全靠瀏覽, 沒搜尋. Postgres GIN + pg_trgm 起步, 量大再上 Meilisearch |
| **商家自助 onboarding** | V1 是 admin 手動建 merchant. V2 加註冊 → KYC → 自動建 tenant |

### 3.3 P2 (V2 後段 / V3 候選)

- 多語言 (en) — V1 全繁中
- 商家移動 app — V1 web only
- AI 推薦 (相似商品 / 看了又看)
- 二手 / 預購 / 募資專案類型
- 分潤儀表板 + 自動對帳
- A/B test framework (LaunchDarkly 或 GrowthBook)

### 3.4 永久 Deferred (V1 CEO review 明確劃出)

- GTM kit 自動化 (60s video / 20 contacts / 10 demos) — 留給 ops 手動做
- Hero merchant program — 留給商業開發
- Case study + referral program — 等真實 paying merchant 後再做

---

## 4. 接手須知 (Onboarding Cheatsheet)

```bash
# 1. 跑本機
docker compose up -d                      # postgres
bun install
bun run dev                               # localhost:3000

# 2. 認證
# .env.local 需要:
#   ADMIN_PASSWORD (登入 /admin/login)
#   ADMIN_SESSION_SECRET (≥32 字元 hex)
#   DATABASE_URL_USER + DATABASE_URL_ADMIN
#   OPENAI_API_KEY (AI import 才需要)
#   INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY (AI import 才需要)

# 3. 測試
bunx vitest run                           # 全跑 (skip OpenAI live)
bunx vitest run tests/rls.e2e.test.ts     # 只跑 RLS
bunx tsc --noEmit                         # type check
bun run lint                              # eslint

# 4. Smoke test
# 跟 tests/v1-smoke.md 跑 25 條 (10-15 分鐘)
```

**重要檔案**
- `src/db/schema.ts` — Drizzle schema, 業務真相
- `drizzle/migrations/000{0,1,2,3}_*.sql` — Forward migrations (0003 含 V1 RLS)
- `src/lib/db/with-tenant.ts` — withTenantTx helper, 所有 tenant 寫入必經
- `src/lib/admin-session.ts` + `admin-session-edge.ts` — 雙檔 (Edge 限制)
- `src/lib/import/url-guard.ts` — SSRF 防禦, 任何外連 fetch 必經
- `eslint.config.mjs` — dbAdmin allowlist, V2 加新檔需更新

**陷阱 (V1 踩過的)**
- Storefront layout 的 `notFound()` 要在 `resolveSlugRedirect()` 之後 — 否則 previousSlug 永遠 404 不到 redirect
- 改 merchant slug / suspended 狀態必須 `revalidateTag` 對應 cache key
- async server component 內 dynamic `await import('./actions')` + 內聯 `'use server'` 在 Next 15 會壞 — 用 `.bind(null, args)` pattern
