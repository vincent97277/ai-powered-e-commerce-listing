# Local-First Setup — demo-sass-2

> Hackathon scope cut: 不用 Neon/R2/Vercel/Sentry。只本地 Postgres + 本地檔案系統 + Inngest dev server。
> 只剩 OpenAI 是 optional 真連 (沒填走 Demo Mode fixture)。

---

## TL;DR — 5 個指令啟動

```bash
# 1. Postgres 已經在跑 (Homebrew postgresql@16)
brew services list | grep postgres   # 確認 started

# 2. 建 DB + roles
psql -h localhost -d postgres -c "CREATE DATABASE demo_sass_2;"
psql -h localhost -d demo_sass_2 -f db/init/01-roles.sql

# 3. 建表 + RLS
pnpm db:generate                      # 產 0000_*_initial.sql
psql -h localhost -d demo_sass_2 -f drizzle/migrations/0000_*.sql
psql -h localhost -d demo_sass_2 -f drizzle/migrations/0001_init_rls.sql

# 4. Seed 兩個 demo merchant (見下方 SQL)

# 5. Run
pnpm dev                              # http://localhost:3000
pnpm inngest:dev                      # 另一個 terminal，AI pipeline worker
```

---

## 詳細步驟

### Step 1 — 確認 Postgres 在跑

如果你已經有 `postgresql@16` 從 Homebrew 跑，跳過：

```bash
brew services list | grep postgres
# postgresql@16 started ...   ← 應該看到
```

如果沒裝：
```bash
brew install postgresql@16
brew services start postgresql@16
```

### Step 2 — 建 database + roles

```bash
# 建 DB
psql -h localhost -d postgres -c "CREATE DATABASE demo_sass_2;"

# 建 web_anon (RLS enforce) + web_admin (BYPASSRLS) 兩個 role
psql -h localhost -d demo_sass_2 -f db/init/01-roles.sql

# 驗證
psql -h localhost -d demo_sass_2 -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('web_anon','web_admin');"
# 預期:
#  web_anon  | f
#  web_admin | t
```

### Step 3 — `.env.local`

從 `.env.local.example` 複製，預設值已經對齊本地 Postgres：

```bash
cp .env.local.example .env.local
```

OpenAI key 可選 — 不填只能跑 Demo Mode。

### Step 4 — 建表 + RLS migration

```bash
# 產 Drizzle 建表 SQL (從 src/db/schema.ts)
pnpm db:generate

# 跑 0000 (建表) + 0001 (RLS policy)
psql -h localhost -d demo_sass_2 -f drizzle/migrations/0000_*.sql
psql -h localhost -d demo_sass_2 -f drizzle/migrations/0001_init_rls.sql
```

### Step 5 — Seed demo merchants

```sql
psql -h localhost -d demo_sass_2 <<'EOF'
INSERT INTO merchants (id, slug, name, brand_voice, theme_vars) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'akami',
   '阿明選物',
   '日式侘寂選物，質感溫潤，文字偏內斂。',
   '{"--brand-primary":"#8B7355","--brand-bg":"#FAF8F5","--brand-text":"#2C2416","--brand-radius":"2px","--brand-font-heading":"Noto Serif TC,serif"}'::jsonb),
  ('22222222-2222-2222-2222-222222222222',
   'afen',
   '阿芬鹹酥雞',
   '夜市熱賣親切庶民，文字活潑，敢用台語。',
   '{"--brand-primary":"#E63946","--brand-bg":"#FFF8E7","--brand-text":"#1D3557","--brand-radius":"12px","--brand-font-heading":"Noto Sans TC,sans-serif"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
EOF
```

### Step 6 — 跑 RLS e2e test 確認隔離 work

```bash
pnpm test:rls
# 預期:
# ✓ T1: missing tenant context returns zero rows
# ✓ T2: tenant A cannot read tenant B rows
# ✓ T3: web_anon cannot escalate to bypass RLS
# Tests  3 passed (3)
```

### Step 7 — 啟動 dev server

```bash
pnpm dev                          # http://localhost:3000
# 另一個 terminal:
pnpm inngest:dev                  # http://localhost:8288 (Inngest UI)
```

---

## URL 對照

| URL | 用途 |
|---|---|
| http://localhost:3000 | 首頁 |
| http://localhost:3000/merchant/products/new | 拍照上傳 + Streaming wow #1 |
| http://localhost:3000/merchant/products/test | 商品詳情卡片 (產品 ID 可隨便填) |
| http://localhost:3000/admin | 平台後台 (列出兩個 merchant) |
| http://localhost:3000/store/akami | 阿明選物 storefront |
| http://localhost:3000/store/afen | 阿芬鹹酥雞 storefront |
| http://localhost:8288 | Inngest dev UI (job runs / logs) |

切換 merchant：右上角 avatar dropdown，整頁色彩 / 字型 transition。

Demo Mode toggle：右下角，按 OFF 走真 GPT-4o (需 OPENAI_API_KEY)。

---

## 完整驗證清單 (orchestration 跑過了)

✅ `pnpm install` 成功
✅ `pnpm dlx shadcn add ...` 12 components 生成
✅ `npx tsc --noEmit` 0 errors
✅ `pnpm lint` 0 errors / 0 warnings
✅ `pnpm build` 7 routes compile
✅ `pnpm dev` 5 routes 都 200
✅ `pnpm test:rls` 3/3 tests pass — multi-tenant 隔離真的 work
✅ `POST /api/uploads` 上傳真的寫進 `public/uploads/{tenant}/{uuid}.png`
✅ Demo merchant seed 完成 (akami + afen)

---

## 常見坑

### 1. `/store/akami` 回 404

商家 slug cache 卡住舊的 null result。**修法**：

```bash
rm -rf .next
pnpm dev
```

或在 `/merchant/settings` 改 slug 時呼叫 `invalidateSlug()` (見 `src/lib/tenant/resolver.ts`)。

### 2. RLS test 跑完 demo merchant 不見

Test 的 `afterAll` 用了同樣的 UUID 範圍清理。修在 `tests/rls.e2e.test.ts` 用 `99999999-...` 開頭的 UUID 避免衝突 (已修)。

如果再撞到，重 seed:
```bash
psql -h localhost -d demo_sass_2 -f db/init/02-seed-demo-merchants.sql
```
(這個 file 還沒寫，照 Step 5 的 SQL 寫成檔案即可)

### 3. `pnpm test:vision` fail (no OpenAI key)

預期。沒填 `OPENAI_API_KEY` 就只能用 Demo Mode (右下角 toggle)。

### 4. Inngest dev 連不上

`pnpm inngest:dev` 預設連 `http://localhost:3000/api/inngest`。如果 dev 跑在 3001 (port 3000 被占)，改用：
```bash
npx inngest-cli@latest dev -u http://localhost:3001/api/inngest
```

### 5. 上傳成功但 Inngest 沒跑

確認 `pnpm inngest:dev` 真的在跑。`http://localhost:8288` 應該開得起來。

---

## v2 升級回雲端

切回 Neon/R2/Vercel 時要改：

| 服務 | 改哪裡 |
|---|---|
| **Neon** | `src/db/index.ts` 換 `drizzle-orm/neon-serverless` driver；`.env` 換 Neon connection string |
| **R2** | 改用 `src/lib/storage/r2-client.ts.legacy` 改回 `.ts`；server action 換成 presigned URL flow；`useFileUpload` 直傳 R2 |
| **Vercel** | `pnpm dlx vercel --prod` |
| **Sentry** | 加 `instrumentation.ts` + `sentry.client.config.ts` |

所有 v2 spec 在 `~/.gstack/projects/demo-sass-2/engineering-handoff-specs-*.md`。

---

## Hackathon Day 流程

開工前 (08:30)：跑上面 Step 1-7 一次

09:00-18:00 build：
- 純 UI / animation / pitch 微調
- Demo Mode 大部分時間開著 (省 OpenAI 額度)
- 接 OpenAI key 做幾次真實生成 sample 證明真的 work

18:00 後：
- 錄 90s backup 影片 (Demo Mode 開著錄)
- 演練 5 分鐘 demo ≥3 次

不需要：
- ❌ Vercel deploy (本地跑就好)
- ❌ R2 setup
- ❌ Neon dashboard 設密碼
