# Project Status

Version-by-version progression for `demo-sass-2`. This replaces the older `V1_STATUS.md` (kept on disk only as historical context — see Git history if needed). Companion to [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [CHANGELOG.md](./CHANGELOG.md).

---

## Summary table

| Version | Date | Theme | Tests | Migrations | Commit |
|---|---|---|---|---|---|
| V1 | 2026-04-30 | Hackathon → multi-merchant platform (Phases 1–7) | 81 | 0000–0003 | `bc10d9c..3f23fca` |
| V1 docs | 2026-04-30 | V1 status + roadmap + bug fix | 81 | — | `bc10d9c` |
| V1.5 (Gemini era) | 2026-04-30 | Cost cap + 健康度 + Export 統一收口 + Gemini swap | 81 → 102 | 0004 | `7735c5b` |
| V1.5 revert | 2026-04-30 | Drop Gemini provider swap (API not viable) | 102 → 99 | 0005 | `e281473` |
| V1.5 fix | 2026-04-30 | Cost tracking actually works (sync path) + dead voice picker removed | 99 → 101 | 0006 | `13a9957` |
| V1.5 Path D | 2026-04-30 | Export truncation signal + 蝦皮 SKU sanitization + walkthrough cleanup | 101 → 102 | — | `e31937d` |
| V1.6 | 2026-05-01 | Admin scale tools + state primitives + dashboard IA | 102 → 141 | — | `4211bef` |
| V1.7 | 2026-05-01 | Onboarding security + switcher scale + dead code | 141 → 154 | 0007 | `0a108c7` |

Bottom line: **154 vitest tests, 25-step manual smoke, 8 forward + 8 rollback migrations.**

---

## V1 — Hackathon → multi-merchant platform

**Why this version**: The starting point. A hackathon prototype was reshaped into a real platform across 7 phases driven by a 4-skill review pipeline (`/office-hours` → `/plan-ceo-review` → `/plan-eng-review` → `/plan-design-review`).

**Shipped (Phases 1–7)**:

- **P1 Schema** — 16 columns + 4 new tables + RLS with `WITH CHECK`
- **P2 Admin auth** — HMAC-signed cookie, Edge runtime split (`admin-session-edge.ts` for middleware, `admin-session.ts` for DB)
- **P3 Admin backend** — Overview + merchant detail + suspend/activate/rename atomic transactions + `previousSlug` 301 redirect
- **P4 Order lifecycle** — Detail page + 待付款 → 已付款 → 已出貨 → 已完成 / 退款 with optimistic concurrency + A4 print shipping slip + list filter
- **P5 Platform UI** — Marketplace home + about/privacy/terms + hackathon copy fully cleaned
- **P6 AI import** — IG / 蝦皮 batch import with SSRF defense (hostname allowlist, DNS rebinding guard, redirect re-check, 5MB body cap, 10s timeout) + Inngest worker + UI progress streaming
- **P7 Polish + tests** — Stock column / sales count / settings / `PendingCallout` + 36 integration tests + RLS e2e expanded to 8 cases

**Notable decisions**:

- RLS via JOIN (not redundant `tenant_id` column) for `order_status_history` and `import_sessions` — eliminates drift class entirely.
- ESLint allowlist enforces `dbAdmin` containment from day one.
- Single-password admin gate (no real auth provider) — fail-closed on missing env.
- Storefront layout's `notFound()` runs *after* `resolveSlugRedirect()` so `previousSlug` 301 actually works.

**Process**: Review pipeline (5 skills) before any code, then 7 incremental commits each with `bunx tsc --noEmit` + `pnpm lint` + targeted vitest before commit.

---

## V1.5 — Internal hardening (cost cap + 健康度 + export)

Three sub-commits because reality intervened.

### V1.5 Gemini era (`7735c5b`)

**Why**: V1's cost cap field (`merchants.daily_ai_cost_cents_cap`) was a column with no enforcement. Health was a vague TODO. CSV export was duplicated across two pages with subtle drift. All three got real implementations + a Gemini provider swap to test the abstraction.

**Shipped**:
- **A2 Cost cap** — `src/lib/observability/ai-cost.ts` with `tokenCost()` + `getDailyCostCents()` + `assertWithinDailyCap()`. Gates in `product-import-batch` and `/api/products/generate` (returns 429). `DailyCostChip` on settings page (green/amber/red <50%/50–80%/>80%).
- **B1 健康度 v0** — `HealthCallout` extending `PendingCallout` chip pattern. 4 chip types (缺照片 / 標題太短 / 零庫存 / $0 價格). Products page filter extended.
- **B2 Export 統一收口** — `ExportDropdown` reused on `/merchant/products` and `/merchant/orders`. xlsx via `exceljs` + 蝦皮 21-column CSV (UTF-8 BOM, RFC 4180, variant Cartesian). Hardened `Content-Disposition` (CRLF strip + `filename*=UTF-8''`).
- **A1 Gemini swap** — Default `gemini-2.5-flash`, env rollback `AI_PROVIDER=openai`. `import_sessions.provider` column (migration 0004) for cost attribution. 20-fixture eval suite (gated by `AI_LIVE=1`).

**Tests**: 81 → 101 (+20). 21 skipped (eval suite, placeholder photos).

**Process**: `/autoplan` + agency-agents (AI Engineer + Backend Architect + Frontend Developer) with both CEO voices (Codex + Claude) and dual eng review.

### V1.5 revert (`e281473`)

**Why**: The user found Gemini API not viable in practice (rate limits, response variance). Reverted Track A1 only; the provider-agnostic cost/health/export work stayed.

**Reverted**:
- `vision.ts` back to OpenAI-only, no `AI_PROVIDER` env, single `MODEL_ID`
- `import_sessions.provider` column dropped (migration 0005)
- `@ai-sdk/google` removed from deps
- Eval suite + 20 placeholder fixtures deleted

**Kept**:
- A2 cost cap (now hardcoding GPT-4o pricing $2.50 / $10 per 1M)
- B1 HealthCallout, B2 ExportDropdown — no provider deps
- Token usage extraction from `result.usage` — provider-agnostic anyway
- `APICallError`-based retry detection (AI SDK improvement, kept)

**Tests**: 101 → 99 (2 pricing tests merged to OpenAI-only path).

### V1.5 cost tracking fix (`13a9957`)

**Why**: V1.5 manual smoke caught two real bugs.

**Bug 1**: `DailyCostChip` stayed at NT$0 even with active AI usage.
- **Root cause A**: `/api/products/generate` (sync path) had no write to record usage. Only the Inngest worker wrote tokens via `import_sessions`. Sync photo upload was completely uncovered.
- **Root cause B**: `tokenCost()` returned USD cents but the cap field is NT$ cents. 9240 input + 488 output tokens = $0.028 USD = 84 NT cents; chip read 0.028 instead of 84 — off by ~30×.
- **Fix**: New `ai_usage_events` table (migration 0006) with RLS + `WITH CHECK` + tenant-created index. `/api/products/generate` writes a row after success (non-blocking on failure). `getDailyCostCents()` aggregates *both* `import_sessions` and `ai_usage_events`. `tokenCost()` now returns NT$ cents (`USD_TO_TWD = 30` hardcoded; V2 dynamic rate).

**Bug 2**: 4 brand voice options on `/merchant/products/new` (簡約日系 / 溫暖手作 / 夜市嘴砲 / 精品質感) — V1 hackathon WOW MOMENT, never wired to API. `/api/products/generate` uses `merchant.brandVoice` from settings.
- **Fix**: Removed `BrandVoiceSelect` component + type + state. Replaced with hint linking to `/merchant/settings`.

**Tests**: 99 → 101 (+2 ai_usage_events tests). HTTP smoke confirmed real photo upload → DB row → chip showed NT$1 / NT$100.

### V1.5 Path D (`e31937d`)

**Why**: V1.5 smoke retrospective surfaced two debt items + cleanup.

**Shipped**:
- **M2 Export silent truncation signal** — Both export routes `limit(5000)` silently. Added `X-Export-Row-Count` + `X-Export-Truncated` response headers. ExportDropdown sub-text mentions 「單次最多 5000 筆」 so the limit is visible before clicking.
- **M3 蝦皮 CSV variant SKU sanitization** — `[sku, o1, o2].filter(Boolean).join('-')` was ambiguous when option strings contained `-` (e.g. `M-L`) or `"` (e.g. `中"号`). Added `sanitizeSkuPart()` that strips non-alphanumeric (Unicode-aware: `\p{L}\p{N}` keeps 中文 / 日文) and caps at 16 chars with `'opt'` fallback. Test 6 covers `M-L → M_L` and `中"号 → 中_号`.
- **Cleanup**: deleted stale hackathon tasks (G3 demo video, H2 demo rehearsal — no longer applicable). Removed walkthrough seed data (王小美 order + 6 photo_upload events).

**Tests**: 101 → 102 (+1).

---

## V1.6 — Admin scale + state primitives + dashboard IA

**Why this version**: Two CEO voices (Codex + Claude) recommended skipping V1.6 entirely and going straight to V2 cloud deploy. The user overrode at the premise gate (Path C — full V1.6) accepting the "October regret risk" — admin tools and frontend primitives become much harder to retrofit after cloud deploy locks the schema.

A 19-candidate brainstorm was trimmed to 6 high-value items + 1 critical security blocker.

**Shipped**:

- **E11 Security blocker** — Codex Eng review caught that middleware verified the HMAC cookie but never called `validateAdminSession()`, so revoked sessions still passed. Critical before A8/A9 ship cross-tenant data. Added DB session liveness check to `(admin)/layout.tsx`. Tightened existing test 14 from `not.toBe(307)` (which had asserted vulnerable behavior) to expect 307 + redirect to `/admin/login`.

- **B4 State primitives** — Codex Design upgraded the plan from 3 to 5 components, adding `StateSurface` and `PartialState` ("one widget fail shouldn't blank the page"). All server components, brand-vars only, `tone='brand'|'neutral'`. ExportDropdown's inline `role=status` div replaced with `toast.success()` (Sonner already wired). 18 vitest cases via `renderToStaticMarkup`.

- **A9 prep — `ai-cost-pricing.ts`** — Eng E2 caught: `USD_TO_TWD = 30` was hardcoded in `ai-cost.ts`; the upcoming A9 platform aggregation would silently re-derive → drift bug. Extracted to `ai-cost-pricing.ts` as sole source. `ai-cost.ts` re-exports for backward compat.

- **B1 Mobile sweep × 5 pages** — Universal `px-12 → px-4 sm:px-8 lg:px-12`. Headers `flex items-end justify-between → flex-col sm:flex-row`. Tables (products / orders) `hidden md:block` + new mobile cards `md:hidden`. DailyCostChip single-line → `flex-col sm:flex-row` (avoid 375px overflow). Touch targets ≥44px on action buttons + filter chips.

- **A1 Admin search + filter + pagination** — E1 fix: `SortDropdown` stripped URL params on sort. Folded sort + search + filter into a single `AdminToolbar` client component (`useSearchParams` sync). Server-side ILIKE on `name`/`slug` + status filter + needs-attention chip (EXISTS subquery for products with health issues). Page-number pagination 20/page + redirect to last valid page if out of range. EmptyState (no results) + ErrorState (query throws) from B4.

- **A9 `/admin/cost`** — Platform AI cost dashboard. `getPlatformCostToday` + `getCostTimeseries14d` + `flagAnomaly` (today > 2× prev_7d_avg → red chip; prev_7d=0 → 「基準資料不足」). 14-day CSS bar chart. Top-10 tenant table.

- **A8 `/admin/queue`** — Cross-merchant operator queue. `src/lib/admin/operator-queue.ts` implements one compound CTE (`product_signals` + `order_signals` LEFT JOIN merchants) — no N+1 (Eng E3). Severity P1–P5 hardcoded. Vertical inbox cards (not table) per Codex Design. Suspended merchants excluded.

- **B5 MerchantInbox** — Replaces `PendingCallout` + `HealthCallout`. 7 chip types in 1 container, severity-grouped. Per-chip color (E4: dropped escalate-all-to-red). One compound query in `lib/merchant/inbox.ts` (E10: avoid 2 round-trips). Per-group cap 5 + "+N more →" overflow. Mobile: KPI grid hidden, summary chip above inbox; desktop: KPI compact stays. PendingCallout + HealthCallout kept one release with `DEPRECATED` header.

**Tests**: 102 → 141 (+39, including the +18 feedback primitives + 8 admin search + 5 operator queue + 4 inbox + others).

**Process**: `/autoplan` + agency-agents (Backend Architect + Frontend Developer + Security Engineer). Both CEO voices reviewed. 16 of 19 candidates explicitly cut as "theater" by dual voices.

**Out of scope**: Bulk actions, snooze persistence, real-time updates, A2-A7/A10/B2-B3/B6-B9, pg_trgm GIN index for >10k merchants (V2), Playwright snapshot testing (V2 alongside cloud deploy).

---

## V1.7 — Tech debt sprint

**Why this version**: Three real items flagged by Codex / CEO during V1.5 + V1.6 reviews but explicitly out-of-scope at the time. Pure debt cleanup; no new features.

**Shipped (D1 Onboarding security hardening, Security Engineer)**:

Without adding email or captcha (user constraint — portfolio project, can't introduce paid services), made `/onboarding` safe via a six-part defense:

- Migration 0007: `merchants.approved_at` + `approved_by_admin` (legacy backfill marks existing merchants as `'legacy'`); new `onboarding_attempts` table with IP + created_at index, RLS web-admin only, partial index on pending merchants.
- Reserved-slug list: 28 paths blocked (`admin`, `api`, `store`, `login`, `_next`, `onboarding`, ...).
- IP rate limit: 1 success / IP / 24h via DB-backed `onboarding_attempts` lookup.
- Honeypot field: hidden `hp_url` input → bots fill it → fake-success returned (no DB write, attacker can't distinguish from real success).
- New merchants `approved_at = NULL` until admin approves (suspended-by-default).
- Merchant layout banner: 「您的帳號正在等待 admin 審核」 for pending merchants.
- Storefront: unapproved merchant → 「暫停營業中」 (200 OK; the customer-facing reason is hidden — same UI as suspended).
- Public listings (marketplace home) filter `approved_at IS NOT NULL`.
- Admin merchant detail: 「核可商家」 button, atomic transaction with audit log entry.
- `/admin/queue` (V1.6 A8) gets a new P1 signal `pending_approval`, ahead of all others.

**Shipped (D2 MerchantSwitcher scale, Frontend Developer)**:

- Replaced `SELECT all merchants` with top-10-by-`updated_at` + `totalCount`.
- `MerchantSwitcher` → client component with inline search + ESC + click-outside (ExportDropdown V1.5 pattern), no-match deep-links to `/merchant-switcher?q=`.
- New `/merchant-switcher` full-list page: `?q=&page=`, ILIKE on `name` + `slug`, 20/page pagination, EmptyState when no results, mobile near-fullscreen panel.
- 44px touch targets throughout.

**Shipped (D3 Dead code removal)**:

- Deleted `PendingCallout.tsx` + `HealthCallout.tsx` (V1.6 B5 marked deprecated; one release of overlap done — verified 0 imports remain).

**Tests**: 141 → 154 (+13: 9 onboarding security + 4 merchant switcher).

**Out of scope (deferred to V2)**:
- Real captcha (Turnstile / hCaptcha)
- Email verification (Resend)
- Per-merchant rate limit (V1.7 is per-IP global)
- `assertNotApproved` guard on `/api/products/import` (defense-in-depth follow-up)

---

## Known limitations (still applies)

- **No real payment gateway** — checkout walks a 「客服收款」 flow (待付款 status flipped manually by merchant). Schema has `payment_webhooks` + `ecpay_trade_no` ready for V2.
- **No real shipping integration** — `tracking_number` / `carrier` are plain text; no 7-11 / 黑貓 API.
- **No email/SMS notifications** — status changes write to audit log only.
- **AI import requires OpenAI key + Inngest dev CLI** for end-to-end (`bunx inngest-cli dev`).
- **Local-only deploy** — Docker Postgres + local filesystem uploads. Schema, migrations, and code are cloud-ready (Neon + R2 + Vercel) — switching is a V2 task.
