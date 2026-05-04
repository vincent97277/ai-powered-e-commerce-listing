# Changelog

Commit-level history for `demo-sass-2`. Per-version narrative + numbers in [STATUS.md](./STATUS.md). Architecture context in [ARCHITECTURE.md](./ARCHITECTURE.md).

Format: every entry is one Git commit with SHA + date + subject + bullet expansion. Trivial commits (merge / formatting) are skipped.

---

## V2.1 — 2026-05-04 (`6da0489`)

**feat(v2.1): 18 theme presets + brand-voice auto-match + settings preset dropdown**

Two user reports addressed in one commit.

**Bug — /merchant/settings 圓角風格 save 後無效**:
- `useTransition` saved OK but ThemeProvider's `useEffect` keyed off `current` object reference. Even when themeVars changed, dep didn't fire reliably.
- Fix: ThemeProvider deps now `[JSON.stringify(current.themeVars)]` — any value change in 5 brand vars triggers re-application.

**Feature — 18 theme presets + brand-voice auto-match**:
- `src/lib/themes/presets.ts` — 18 `ThemePreset` entries (id / label / hint / emoji / 3-7 中文 keywords + 5 themeVars). Vibes: 質感日系 / 夜市熱炒 / 文青咖啡 / 街頭潮男 / 手搖飲品 / 簡約現代 / 韓系少女 / 暖陽小農 / 海島度假 / 手工飾品 / 童書文具 / 個性復古 / 科技電商 / 清新花藝 / 健身保健 / 甜點烘焙 / 書店書房 / 戶外運動.
- `src/lib/themes/match.ts` — `pickThemeForVoice(brandVoice)` keyword-substring scoring + stable tiebreak + fallback `modern-minimal`. `getThemeById(id)` lookup.
- `/onboarding` no longer random-picks 3 themes — calls `pickThemeForVoice(brandVoice)`. V1.7 D1 honeypot/reserved-slug/rate-limit preserved.
- Settings: 「套用預設主題」 dropdown above color/radius/font grid. Picking overwrites all 5 fields; dropdown self-resets.

**Tests**: 195 → 211 (+16 in `tests/themes/match.test.ts`).

**Note**: sub-agent pushed directly to `main` instead of using feature branch + PR (skipping the workflow established in V2.0). Logged as process drift; future sprints should re-confirm the PR flow.

---

## V1.9.2 — 2026-05-04 (`9c5dbab`)

**fix(v1.9.2): color swatch overflow on /merchant/settings 視覺主題**

User-reported: 主色/底色/文字色 顏色方塊被 Input border 遮擋.

Root cause: native `<input type="color">` in Chrome/Safari/Firefox renders the color swatch via `::-webkit-color-swatch-wrapper` (or `::-moz-color-swatch`) with default ~4px inset padding + 1px border. The ColorField wrapper has `overflow-hidden` + `var(--brand-radius)`, so the inset padding gets clipped at the rounded corners, exposing the body background between swatch and border.

- Fix: 4-line CSS reset in `globals.css` to fill the entire input area (`::-webkit-color-swatch-wrapper { padding: 0; border: none }`, `::-webkit-color-swatch { border: none; border-radius: 0 }`, `::-moz-color-swatch { border: none }`).
- CSS-only, zero JS impact.

---

## V2.0 — 2026-05-04 (`f96e02e`, PR #1 squash-merged)

**feat(v2): per-merchant authentication (email + password + DB sessions)**

The structural fix for the V1.7 review side-find: merchants now have their own credentials, not a shared `demo-merchant-id` cookie. **First sprint shipped via feature branch + PR + squash-merge workflow** (per V1.9.1 git workflow upgrade). Implemented across 5 sequential agency-agent tasks (102 → 106).

- **Task 102 — Schema (Backend Architect)** — Migration 0008: `merchants.email` + `password_hash` + `merchant_sessions` table with `revoked_at`. Functional unique index on `lower(email)`. RLS deny-all to `web_anon`. `bcryptjs@3.0.3` added. `scripts/seed-merchant-auth.ts` backfills 7 demo merchants.
- **Task 103 — Auth core (Security Engineer)** — `src/lib/merchant-session.ts` (Node, DB-coupled): timing-safe HMAC, `loginMerchant` with bcrypt + username-enumeration defense (constant-time fake-hash on miss; status checks revealed only AFTER password match). `src/lib/merchant-session-edge.ts` (Edge, Web Crypto). `middleware.ts` gates `/merchant/*` (skips login/signup/logout), 503 if env missing. `MERCHANT_SESSION_SECRET` 64 hex chars.
- **Task 104 — Login + signup + onboarding (Frontend Developer)** — `/merchant/login` + `/merchant/logout` (POST-only, revokes DB session, idempotent). `/onboarding` extended: email + password + confirm fields, V1.7 D1 honeypot/reserved/rate-limit preserved. Layout: simple "merchant name + 登出 button" header (V1.7 D2 MerchantSwitcher obsolete).
- **Task 105 — Migrate consumers + remove switcher (Backend Architect)** — `resolveMerchantFromCookie()` rewritten (no args, reads `merchant-session`, redirects on failure). 17 caller sites migrated. `(merchant)/layout.tsx` adds E11 DB session validation. DELETED 5 files: MerchantSwitcher (4 files) + `demo-merchants.ts` + `merchant-switcher` test.
- **Task 106 — Tests + smoke + PR** — 195 tests pass (was 164: +26 auth + 9 login + 4 stock-edit minus 4 switcher). HTTP smoke verified end-to-end: 7 paths covering login/logout/stale-cookie-rejection/switcher-404. PR #1 self-reviewed + squash-merged + `v2.0` tag pushed.

Demo creds (post-seed): email `{slug}@demo.local`, password `demo1234`.

Out of scope (V2.1): password reset (needs Resend), "remember me" longer session, multi-user-per-merchant, OAuth/2FA.

---

## V1.9.1 — 2026-05-04 (`4c762de`)

**fix(v1.9.1): stock edit + input/textarea brand-radius**

Two user-reported bugs after V1.9 ship.

- **Bug 1 — 商品沒辦法改庫存** — `updateProductAction` accepted only `title/description/priceCents`, no `stockQuantity`. `EditableProductFields` had no stock input. Fix: extended action patch type with `stockQuantity?: number` + integer validation (0-99999, reject `.5`/negative/overflow). Added stock input as 2-col grid (price + stock side-by-side on sm+, stacked mobile). Added "目前庫存" `<StatusChip>` on detail page (error/warning/neutral based on `lowStockThreshold`). 4 new tests.
- **Bug 2 — 圓角 input 內含元素超出擠壓外框** — shadcn `Input` + `Textarea` hardcoded `rounded-lg` (8px), but `--brand-radius` is 2px (akami serif) / 4px (platform). Visual mismatch + focus ring/3 box-shadow rendered at 8px radius escaping the actual visual border. Fix: `rounded-lg` → `rounded-[var(--brand-radius)]`. One-line change per file (Input.tsx + Textarea.tsx).

Tests: 160 → 164. tsc + lint clean.

Note: cleaned 1 stale `photo_upload` event from `stylish-man` tenant (V1.5 cost-tracking smoke artifact polluting platform-wide aggregation tests).

---

## V1.9 — 2026-05-01 (`39a8640`)

**feat(v1.9): UI overhaul — token foundation + brand identity + polish + whimsy**

User said "UI 還是不夠漂亮". Dispatched 4-agent design audit (UI Designer 6.5/10 / UX Architect: token leak / Brand Guardian: Linear clone / Whimsy: anxious AI wait) → synthesized into 3-tier ranked action list → 3 sequential implementation agents.

- **Tier 1 Foundation (UX Architect)** — 18 semantic tokens in `:root` (`--brand-tint-{3,8,14}`, `--brand-edge-{12,18,28}`, `--bg-card`, `--ink-muted`, `--status-{success,error,warning,info}-{soft,edge}`). shadcn alias bridge: `--background`, `--primary`, `--card`, `--border` all alias to `var(--brand-*)`. ESLint rule blocks `bg-zinc-*` / `bg-amber-50` / hardcoded oklch in `(admin|merchant|storefront)/**` (caught 150 violations across 13 files first run, all fixed). `<StatusChip>` primitive replaces 5 forked chip implementations.
- **Tier 2 Brand identity (Brand Guardian)** — Wordmark "Catalogify" Inter 700 + stacked-rectangle glyph in 柿色 `#D97757` (`Wordmark.tsx`). `src/app/icon.tsx` for favicon. `.platform` palette warm-shifted: `#18181B` → `#1A1614`, `#FAFAFA` → `#FAF8F3`, introduced `--platform-accent`. `MerchantCard` 4px brand color stripe at top from `themeVars`. Storefront 32px platform footer wrapped in `.platform` (forces Linear-tone in just that strip). Tagline rewrite to TW全形標點. Homepage hero stat strip + 5-emoji merchant peek.
- **Tier 3 Polish + whimsy (UI Designer + Whimsy)** — Storefront product grid: removed `boxShadow` inline (was killing `.hover-lift`), bumped radius 1×→2× brand-radius, group-hover scale 1.04. EmptyState migration to `feedback/EmptyState` (5 sites). Icon stroke audit 5 widths → 3 canonical (1.8/2.0/2.2) + hero 1.5 across ~25 files. Whimsy quick wins: empty arrow-dance + customer order voiced thank-you (`src/lib/brand-voice/thank-you.ts` heuristic 4-voice tone mapper) + AI 7-second scan-line + rotating reassurance copy.

Tests: 154 → 160 (+6 brand-voice unit tests). tsc + lint clean. HTTP smoke verified 4 routes.

---

## V1.8 — 2026-05-01 (`cc7c3c9`)

**docs(v1.8): portfolio entry — README + ARCHITECTURE + STATUS + CHANGELOG**

Pure docs sprint per "practice/portfolio" goal. No code changes — 5 docs at repo root, audience = recruiter (30s skim) + same-stack engineer (5min read).

- **NEW** `README.md` (882w, 1 mermaid) — entry point. Stack badges, 7 feature bullets, system overview diagram, quickstart, "Why this is interesting" with 6 concrete engineering callouts (RLS+WITH CHECK, hostname-allowlist SSRF, cost cap as load-bearing, dbAdmin ESLint containment, onboarding security w/o email/captcha, defense-in-depth admin sessions).
- **NEW** `ARCHITECTURE.md` (2356w, 4 mermaid) — engineer-depth: ER diagram, role split rationale, AI import sequence, admin observability flow, security layers, frontend patterns, testing strategy.
- **NEW** `STATUS.md` (2138w) — version-by-version V1 → V1.7 progression, replaces `V1_STATUS.md`. Per-version: Why this version / Shipped / Notable decisions / Process. Gemini revert + V1.5 cost-tracking bug kept verbatim to show real iteration.
- **NEW** `CHANGELOG.md` (1931w) — git log distilled, 3-7 bullets per major commit.
- **EDIT** `LOCAL_SETUP.md` full rewrite (was pnpm/Homebrew/R2-stale; now Docker + bun + V1.7-aware including `approved_at` seed gotcha, `OPENAI_API_KEY` required, Inngest dev cli for batch import).
- **EDIT** `BUILD_DAY.md` banner labeling as hackathon artifact.
- **DELETE** `V1_STATUS.md` superseded by STATUS.md.

8881 words total, 5 mermaid diagrams. All cross-linked. User actions remaining (out of code scope): screenshots / GitHub repo description / 60s walkthrough.

---

## V1.7 — 2026-05-01 (`0a108c7`)

**fix(v1.7): tech debt — onboarding security + switcher scale + dead code**

Pure tech debt sprint per route-2 decision. Three items flagged by Codex / CEO during V1.5 + V1.6 reviews but explicitly out-of-scope at the time.

- **D1 Onboarding security hardening** without adding email/captcha:
  - Migration 0007: `merchants.approved_at` + `approved_by_admin` (legacy backfill); `onboarding_attempts` table with IP + created_at index, RLS web-admin-only, partial index on pending merchants.
  - 28-entry reserved-slug list (admin / api / store / login / _next / ...).
  - IP rate limit: 1 success / IP / 24h via DB-backed `onboarding_attempts`.
  - Honeypot field: hidden `hp_url` input → bots fill, fake-success returned.
  - New merchants `approved_at=NULL` until admin approves (suspended-by-default).
  - Merchant layout banner: 「您的帳號正在等待 admin 審核」.
  - Storefront: unapproved → 「暫停營業中」 (200 OK).
  - Public marketplace listings filter `approved_at IS NOT NULL`.
  - Admin merchant detail: 「核可商家」 button, atomic transaction with audit log.
  - `/admin/queue` gets new P1 signal `pending_approval`, ahead of all others.
- **D2 MerchantSwitcher scale**:
  - Replaced `SELECT all` with top-10-by-`updated_at` + `totalCount`.
  - Client component with inline search + ESC + click-outside (ExportDropdown V1.5 pattern).
  - New `/merchant-switcher?q=&page=` full-list page, 20/page pagination, ILIKE on `name`+`slug`, EmptyState when no results.
  - 44px touch targets throughout.
- **D3 Dead code**:
  - Deleted deprecated `PendingCallout.tsx` + `HealthCallout.tsx` (V1.6 B5 marked deprecated; one release overlap done, 0 imports remain).
- Tests: 141 → 154 (+13: 9 onboarding security + 4 merchant switcher).

---

## V1.6 — 2026-05-01 (`4211bef`)

**feat(v1.6): admin scale tools + state primitives + dashboard IA**

Both CEO voices recommended skipping V1.6 = V2 deploy. User overrode at premise gate (Path C — full V1.6) accepting October regret risk. 19-candidate brainstorm trimmed to 6 items + 1 critical security blocker.

- **E11 Admin layout DB session validation** (security blocker):
  - Codex Eng caught: middleware only HMAC-verified; never called `validateAdminSession()` → revoked sessions still passed. Critical before A8/A9 ship cross-tenant data.
  - Added `validateAdminSession()` to `(admin)/layout.tsx`.
  - Tightened existing test 14 from `not.toBe(307)` (asserted vulnerable behavior) to expect 307 + redirect to `/admin/login`.
- **B4 Five state primitives + Sonner consolidation**:
  - `<StateSurface>` + `<EmptyState>` + `<LoadingState>` + `<ErrorState>` + `<PartialState>` — server components, brand-vars only, `tone='brand'|'neutral'`.
  - `PartialState` added per Codex Design ("one widget fail shouldn't blank the page").
  - ExportDropdown inline `role=status` div replaced with `toast.success()` (Sonner already wired).
  - 18 vitest cases via `renderToStaticMarkup` (no `@testing-library/react` needed).
- **A9 prep — extract `ai-cost-pricing.ts`**:
  - Eng E2 caught: `USD_TO_TWD=30` hardcoded in `ai-cost.ts`; A9 platform aggregation would silently re-derive → drift. Extracted as sole source.
- **B1 Mobile sweep × 5 pages**:
  - Universal `px-12 → px-4 sm:px-8 lg:px-12`.
  - Headers `flex items-end justify-between → flex-col sm:flex-row`.
  - Tables (products/orders): `hidden md:block` + new mobile cards `md:hidden`.
  - DailyCostChip single-line → `flex-col sm:flex-row` (avoid 375px overflow).
  - Touch targets ≥44px on action buttons + filter chips.
- **A1 Admin search + filter + pagination**:
  - E1 fix: `SortDropdown` stripped URL params on sort. Folded into single `AdminToolbar` (`useSearchParams` sync).
  - Server-side ILIKE on `name`/`slug` + status filter + needs-attention chip (EXISTS subquery).
  - Page-number pagination 20/page + redirect to last valid page if out of range.
  - 8 new admin-search integration tests.
- **A9 `/admin/cost`**:
  - `getPlatformCostToday` + `getCostTimeseries14d` + `flagAnomaly` (today > 2× prev_7d_avg → red; prev_7d=0 → 「基準資料不足」).
  - 14-day CSS bar chart + top-10 tenant table.
  - 3 new platform aggregation tests.
- **A8 `/admin/queue`**:
  - One compound CTE (`product_signals` + `order_signals` LEFT JOIN merchants), no N+1 (Eng E3).
  - Severity P1–P5 hardcoded. Vertical inbox cards. Suspended merchants excluded.
  - ESLint allowlist: `src/lib/admin/**` added.
  - 5 new tests.
- **B5 MerchantInbox replaces PendingCallout + HealthCallout**:
  - 7 chip types in 1 container, severity-grouped.
  - Per-chip color (E4: dropped escalate-all-to-red).
  - One compound query in `lib/merchant/inbox.ts` (E10: avoid 2 round-trips).
  - Per-group cap 5 + "+N more →" overflow.
  - PendingCallout + HealthCallout kept one release with `DEPRECATED` header.
  - 4 new integration tests.
- Tests: 102 → 141 (+39 net).

---

## V1.5 Path D — 2026-04-30 (`e31937d`)

**fix(v1.5): Path D — review M2/M3 cleanups**

Discovered + closed during V1.5 smoke retrospective. Pure debt cleanup, no new features.

- **M2 Export silent truncation signal**:
  - Both `/api/export/orders` and `/api/export/products` `limit(5000)` silently dropped rows.
  - Added `X-Export-Row-Count` + `X-Export-Truncated` (1 if at cap) headers.
  - ExportDropdown sub-text now mentions 「單次最多 5000 筆」 so merchants see the limit before clicking.
- **M3 蝦皮 CSV variant SKU sanitization**:
  - `[sku, o1, o2].filter(Boolean).join('-')` was ambiguous when option strings contained `-` (e.g. `M-L`) or `"` (e.g. `中"号`).
  - `sanitizeSkuPart()`: strips non-alphanumeric (Unicode-aware: `\p{L}\p{N}` keeps 中文/日文), caps at 16 chars, falls back to `'opt'` on empty.
  - Test case 6 covers `M-L → M_L` and `中"号 → 中_号`.
- **Cleanup** (no diff):
  - Stale hackathon tasks deleted (G3 demo video, H2 demo rehearsal — no longer applicable post-V1.5).
  - DB: 1 walkthrough order (王小美 / `demo-walkthrough@test.com`) + 6 photo_upload events from smoke testing removed.
- Tests: 101 → 102.

---

## V1.5 cost tracking fix — 2026-04-30 (`13a9957`)

**fix(v1.5): cost cap actually tracks sync photo uploads + remove dead voice picker**

Two issues found during V1.5 manual smoke test.

- **Issue 1 — DailyCostChip stayed at NT$0 even with active AI usage**:
  - Root cause A: `/api/products/generate` (sync path) had no write to record usage → only Inngest worker (`product-ingest.ts`) wrote tokens via `import_sessions` → sync photo upload completely uncovered.
  - Root cause B: `tokenCost()` returned USD cents but cap field is NT$ cents → 9240 in + 488 out tokens = $0.028 USD = 84 NT cents; chip read 0.028 instead of 84 — off by ~30×.
  - Fix:
    - New `ai_usage_events` table (`id, tenant_id, tokens_in, tokens_out, source, model`) + RLS `tenant_isolation` policy + `WITH CHECK` + tenant-created index.
    - Migration `0006_ai_usage_events.sql` + rollback.
    - `/api/products/generate` writes a row after success (non-blocking on failure).
    - `getDailyCostCents` aggregates from BOTH `import_sessions` AND `ai_usage_events`.
    - `tokenCost()` now returns NT$ cents (multiply USD by `USD_TO_TWD=30` hardcoded; V2 dynamic rate).
    - Cost-cap tests updated: pricing constants × 30, light-usage seed reduced.
- **Issue 2 — 4 brand voice options on `/merchant/products/new`**:
  - V1 hackathon WOW MOMENT 第二波 demo, never wired to API. `/api/products/generate` uses `merchant.brandVoice` from settings, not the picker.
  - Removed `BrandVoiceSelect` component + `BrandVoice` type + `useState`. Replaced with hint linking to `/merchant/settings`.
- Tests: 99 → 101 (+2 ai_usage_events tests). HTTP smoke confirmed real photo upload → row written → DailyCostChip showed NT$1 / NT$100 (84 cents accumulated from 6 calls).

---

## V1.5 revert — 2026-04-30 (`e281473`)

**revert(v1.5): drop Gemini provider swap, keep cost cap + health + export**

User found Gemini API not viable in practice. Reverted Track A1; kept A2 / B1 / B2 (provider-agnostic).

- Reverted:
  - `src/lib/ai/vision.ts`: OpenAI-only, no `AI_PROVIDER` env, single `MODEL_ID`.
  - `import_sessions.provider` column dropped (migration 0005).
  - `@ai-sdk/google` removed from deps.
  - `tests/ai/eval-suite.test.ts` + 20 placeholder fixtures + generator deleted.
  - `.env.local.example`: `AI_PROVIDER` + `GOOGLE_GENERATIVE_AI_API_KEY` removed.
- Kept:
  - A2 cost cap (now hardcodes GPT-4o pricing $2.50 / $10 per 1M).
  - B1 HealthCallout, B2 ExportDropdown — no provider deps.
  - C1 token usage extraction from `result.usage` — provider-agnostic.
  - `APICallError`-based retry detection (AI SDK improvement).
- Tests: 101 → 99 (2 pricing tests merged to OpenAI-only path).

---

## V1.5 — 2026-04-30 (`7735c5b`)

**feat(v1.5): Gemini swap + cost cap + 健康度 + export 統一收口**

Implemented via `/autoplan` + agency-agents role workflow.

- **A1 (AI Engineer) — Gemini swap + eval suite**:
  - Default provider `gemini-2.5-flash`, env-var rollback to OpenAI (`AI_PROVIDER`).
  - `@ai-sdk/google` added; `APICallError`-based retry detection.
  - `import_sessions.provider` column (migration 0004) — records which provider produced each session for cost attribution + debugging.
  - 20-fixture eval suite (gated by `AI_LIVE=1`) — placeholders pending real photos.
- **A2 (Backend Architect) — Cost cap (now load-bearing)**:
  - `src/lib/observability/ai-cost.ts`: `tokenCost()` + `getDailyCostCents()` + `assertWithinDailyCap()`.
  - Gates in `product-import-batch` and `/api/products/generate` (429 + tx mark-failed).
  - `DailyCostChip` on settings page (green / amber / red <50% / 50–80% / >80%).
  - `product-ingest.ts` writes `tokens_in` / `tokens_out` per session (atomic increment via `withTenantTx` + `step.run` idempotency).
- **B1 (Frontend Developer) — 健康度 v0**:
  - `HealthCallout` extends `PendingCallout` chip pattern.
  - 4 chip types: 缺照片 / 標題太短 / 零庫存 / $0 價格 (top 3 only, hide if 0).
  - Products page filter extended: `?filter=no_photo|short_title|zero_stock|zero_price`.
  - `no_photo` includes `/fixtures/` paths for consistency.
- **B2 (Frontend Developer) — Export 統一收口**:
  - `ExportDropdown` 「匯出 ▾」 reused on `/merchant/products` + `/merchant/orders`.
  - Excel via `exceljs` + 蝦皮 21-column CSV (UTF-8 BOM, RFC 4180, variant Cartesian).
  - `/api/export/{orders,products}` routes — `withTenantTx` + `assertNotSuspended` guard.
  - `Content-Disposition` hardened (CRLF strip + `filename*=UTF-8''`).
- Tests: 81 → 101 passing, 21 skipped (eval suite).

---

## V1 docs — 2026-04-30 (`bc10d9c`)

**docs(v1): V1 status + roadmap + saveNote bug fix**

Wrote `V1_STATUS.md` (now superseded by [STATUS.md](./STATUS.md)) — flow / state / roadmap. Bundled a fix for a `saveNote` bug discovered during the V1 retrospective.

---

## V1 Phase 7 — 2026-04-29 (`3f23fca`)

**feat(polish): 庫存欄/銷量/設定/PendingCallout + 36 integration tests (Phase 7)**

V1 final phase: stock column + sales count display + merchant settings page + first-version `PendingCallout`. Bumped integration test coverage by 36 cases.

---

## V1 Phase 6 — 2026-04-29 (`e1989b7`)

**feat(import): IG/蝦皮 一鍵 import — SSRF/parser/inngest worker/UI (Phase 6)**

- `src/lib/import/url-guard.ts`: hostname allowlist + DNS rebinding + redirect re-check + 5MB body cap + 10s timeout.
- IG + 蝦皮 fetchers (HTML parse, `og:` extraction).
- Inngest worker `product-import-batch` + `product-ingest`.
- Merchant UI to paste URL and watch progress.

---

## V1 Phase 5 — 2026-04-29 (`9439be7`)

**feat(platform): marketplace 首頁 + 法遵頁 + hackathon 字樣全清 (Phase 5)**

Marketplace home (`/`) + about / privacy / terms. Removed all hackathon-era copy.

---

## V1 Phase 4 — 2026-04-29 (`5bd33a2`)

**feat(orders): 訂單 detail + status flow + 列印 + 列表 filter (Phase 4)**

Full order lifecycle: 待付款 → 已付款 → 已出貨 → 已完成 / 退款. Optimistic concurrency on flips. A4 print shipping slip. List filter.

---

## V1 Phase 3 — 2026-04-29 (`7109076`)

**feat(admin): admin backend + suspend guards + storefront 暫停/redirect (Phase 3)**

Admin backend (overview + merchant detail). Suspend / activate / rename atomic transactions. Storefront 「暫停營業中」 (200 OK). `previousSlug` 301.

---

## V1 Phase 2 — 2026-04-29 (`4d7e851`)

**feat(auth): admin auth gate — HMAC cookie + middleware + login (Phase 2)**

HMAC-signed admin session cookie. Edge runtime split (`admin-session-edge.ts` for middleware; `admin-session.ts` for DB). Login + logout flows. Fail-closed on missing env.

---

## V1 Phase 1 — 2026-04-29 (`f2fca74`)

**feat(schema): V1 migrations — 16 columns + 4 tables + RLS (Phase 1)**

- Migration 0002: 16 column additions across V1 schema expansion.
- Migration 0003: V1 RLS — `web_anon` / `web_admin` roles, every tenant table gets `USING` + `WITH CHECK`.
- 4 new tables: `admin_action_history`, `import_sessions`, `admin_sessions`, `payment_webhooks`.
- 8-case RLS e2e suite shipping with the migration.

---

## Pre-V1 commits (skipped from version table)

For completeness, the prototype-era commits before V1 finalization:

- `69ef344` `feat: 商家訂單列表 + 分析 dashboard + 商家資料設定`
- `1e2cd12` `feat: 商家 dashboard + 商品 CRUD + AI 完成後 CTA`
- `d3fc7ad` `feat: multi-merchant marketplace V1`
- `2131d66` `fix: wire Demo Mode OFF to real GPT-4o flow`
- `0043068` `feat: UI polish — 3 agents (Designer + Storyteller + Whimsy)`
- `4e812a7` `refactor: switch to local-first stack (Postgres + local FS)`
- `bcbfe03` `feat: hackathon scaffolding ready for build day`
- `84f4c33` `Initial commit`
