# Build Day Checklist — rls-ai-shop

> **Historical artifact (archived V2.4)** — preserved as the original hackathon checklist (V1 day-of plan). Project has shipped 13+ versions since (V1 → V2.3). For current state see [STATUS.md](../../STATUS.md); for setup see [LOCAL_SETUP.md](../../LOCAL_SETUP.md). Path was `/BUILD_DAY.md` until V2.4 when it moved here to keep root focused on living docs.

> 5 輪 orchestration 已完成。Code 80% 已 ready，dev server 已驗證可跑。
> 你需要做的事：3 件 USER 必做 + 4 件 hackathon day 機械式跑

---

## 動工前 (08:30-09:00) — USER 必做 3 件事

### 1. 註冊 5 個服務帳號 + OpenAI 充值 USD 10 (#A1)
全部用 GitHub OAuth 省時。OpenAI 充值要等 5-10 分鐘額度生效，**先做這個**。

- [ ] [Neon](https://console.neon.tech) — 建 project (region: `AWS ap-southeast-1` 跟 Vercel 同區)
- [ ] [Cloudflare R2](https://dash.cloudflare.com) — 開 bucket `rls-ai-shop-photos`
- [ ] [OpenAI](https://platform.openai.com) — 充值 **USD 10** + 設 budget alert USD 10/month
- [ ] [Inngest](https://app.inngest.com) — 建 app `rls-ai-shop`，拿 Event Key + Signing Key
- [ ] [Sentry](https://sentry.io) — 建 Next.js project，拿 DSN

### 2. Neon 建雙 ROLE (#B3)
在 Neon SQL Editor 跑：

```sql
ALTER ROLE web_anon WITH LOGIN PASSWORD 'YOUR_PASSWORD_HERE';
ALTER ROLE web_admin WITH LOGIN PASSWORD 'YOUR_OTHER_PASSWORD';
```

(注意：role 已在 `drizzle/migrations/0001_init_rls.sql` 建好，這裡只需設密碼)

或直接在 Neon dashboard 的 Roles 頁面建 `web_anon` + `web_admin` 兩個 role + 各自的密碼，從 dashboard 複製 connection string 用。

### 3. 填好 `.env.local` (#A3)
```bash
cp .env.local.example .env.local
# 編輯填入所有 API key 跟 connection string
```

關鍵變數：
- `DATABASE_URL` — Neon owner connection (跑 migration 用)
- `DATABASE_URL_USER` — web_anon connection (RLS 強制)
- `DATABASE_URL_ADMIN` — web_admin connection (BYPASSRLS)
- `OPENAI_API_KEY` — 不加 NEXT_PUBLIC_ 前綴
- `R2_*` 6 個變數
- `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY`
- `SENTRY_DSN`

R2 dashboard 還要把 `src/lib/storage/r2-cors-config.json` 內容貼進 CORS Policy。

---

## 機械式 build day (09:00-22:00) — Superpowers 跑

### Sprint 1: Bootstrap (09:00-09:30)

```bash
# Drizzle migrations
pnpm db:generate    # 產生 0000_*_initial.sql
pnpm db:push        # 把 schema + 0001_init_rls 推到 Neon

# Smoke tests (#A4)
pnpm test:vision ./tests/fixtures/sample-teacup.jpg     # GPT-4o vision 通？
pnpm test:r2 ./tests/fixtures/sample-teacup.jpg          # R2 upload 通？

# Inngest dev (在另一個 terminal)
pnpm inngest:dev
```

⚠️ **準備一張 sample 茶杯照片**放 `tests/fixtures/sample-teacup.jpg`。任何 product photo 都行，建議 < 2MB。

### Sprint 2: 跑 dev server + 確認流程通 (09:30-12:00)

```bash
pnpm dev
```

逐一驗證：
- [ ] http://localhost:3000/ 看到 Catalogify 首頁
- [ ] http://localhost:3000/merchant/products/new 拖照片觸發 streaming (Demo Mode ON 走 fixture)
- [ ] http://localhost:3000/merchant/products/test 看到產品詳情卡片版
- [ ] 切 avatar (阿明 → 阿芬) 整頁色彩 / 字型 transition 順暢
- [ ] 「下載 CSV」按鈕真出 csv 檔
- [ ] http://localhost:3000/admin 看到商家列表 (需先 seed 兩個 demo merchant)

### Sprint 3: RLS e2e test (#B6) (午餐後 13:00-13:30)

```bash
pnpm vitest run tests/rls.e2e.test.ts
```

3 個 test case 都應該 PASS：
- T1: 沒 set tenant context → 0 rows
- T2: tenant A 看不到 tenant B
- T3: web_anon 無法升權 BYPASSRLS

### Sprint 4: 用 demo mode 整個流程跑通 (13:30-15:00)

```bash
# Seed 兩個 demo merchant
psql $DATABASE_URL -c "
INSERT INTO merchants (id, slug, name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'akami', '阿明選物'),
  ('22222222-2222-2222-2222-222222222222', 'afen', '阿芬鹹酥雞')
ON CONFLICT DO NOTHING;
"
```

跑 5 分鐘 demo flow 至少 2 次。

### Sprint 5: Vercel deploy (#G4) (15:00-16:00)

```bash
pnpm dlx vercel
# 跟著互動提示，第一次會問 link to existing? / framework? 等
pnpm dlx vercel env pull   # 把 .env.local 同步上 Vercel
pnpm dlx vercel --prod     # production deploy
```

驗證 production URL 跑得起來。

### Sprint 6: USER 必做 — 錄 backup 影片 (#G3) (18:00-19:00)

完整跑一次 demo flow 用 OBS / QuickTime 錄屏 90 秒 (含口白)。
存成 `demo_backup.mp4` 放：
- 桌面
- USB 隨身碟
- Google Drive

最壞情況 (現場全炸) 直接放影片 + 講者解釋。

### Sprint 7: USER 必做 — 演練 ≥3 次 (#H2) (19:00-21:00)

開 `~/.gstack/projects/rls-ai-shop/pitch-deck-content-20260428-210243.md`，套版進 Pitch.com / Keynote。

完整 5 分鐘演練：
- 0:00-0:45 開場 (痛點故事)
- 0:45-3:45 Live demo (3 分鐘)
- 3:45-4:30 收尾 + 3 個 ask

手機計時器設 4:30 震動。
跑 ≥3 次，每次找 1 個 bug 就立刻修或 mock 掉。

---

## 失敗 fallback 對照表

| 失敗情境 | Mitigation |
|---|---|
| GPT-4o API 14:00 後變慢 / rate limit | Demo Mode toggle ON (走 fixture)，講稿備一句「為了示範穩定我們用預錄」 |
| R2 / Neon 11:00 還沒通 | 砍 R2 改 base64 直傳；DB 改 in-memory |
| Vercel deploy 掛 | 本機 `pnpm dev` + ngrok |
| 現場網路斷 | iPhone 熱點 + backup 影片 |
| AI 跑超久 (>15 秒) | 立刻切口白「趁等的時候講商業模式」，把 unit economics 提前講 |
| RLS e2e test fail | 看 `engineering-handoff-specs.md §1` 對照，注意 `set_config(..., true)` 必須在 transaction 內 |

---

## 已驗證項目 (orchestration 跑過了)

- ✅ `pnpm install` 成功
- ✅ `npx tsc --noEmit` 0 errors
- ✅ `pnpm lint` 0 errors / 0 warnings
- ✅ `pnpm build` 6 routes compile success
- ✅ `pnpm dev` runs，3 個關鍵 route 都回 200

剩下要驗證的只有「真連 Neon/R2/OpenAI/Inngest」— 那需要 .env.local 填好才能驗。

---

## 補充：3 個 demo archetype 已備

`public/fixtures/products/` 有 3 套 fixture：
- `teacup.json` + `teacup-bg-removed.png` (阿明選物)
- `phonecase.json` + `phonecase-bg-removed.png` (小傑 3C)
- `sauce.json` + `sauce-bg-removed.png` (阿芬醃料)

去背 PNG 是 mock 白底 (用 Python 生 512x512 純白 PNG)。**Demo 階段先用這個**，後面真的要 demo 完整 pipeline 再串 remove.bg / OpenAI image edit。

---

# 21 點之後就睡

Hackathon 評審通常在隔天。記得：
- 早睡 > 多練 1 次
- 影片備份 USB + Drive 雙份
- iPhone 熱點預先連好但不啟用

Good luck.
