# Changelog

Commit-level history for `demo-sass-2`. Per-version narrative + numbers in [STATUS.md](./STATUS.md). Architecture context in [ARCHITECTURE.md](./ARCHITECTURE.md).

Format: every entry is one Git commit with SHA + date + subject + bullet expansion. Trivial commits (merge / formatting) are skipped.

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
