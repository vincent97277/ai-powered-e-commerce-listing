# Project Status

Version-by-version progression for `rls-ai-shop`. This replaces the older `V1_STATUS.md` (kept on disk only as historical context — see Git history if needed). Companion to [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [CHANGELOG.md](./CHANGELOG.md).

> **Doc role**: STATUS = per-version theme + numbers + rationale (the *why*). [CHANGELOG.md](./CHANGELOG.md) = commit-level mechanical entries (the *what*). Going forward, narrative belongs here; SHA-level minutiae belongs there.

> **URL note** (2026-05-08): production domain was renamed `demo-sass-2.vercel.app` → `rls-ai-shop.vercel.app` as part of the V2.6 product-name unification. The old domain was replaced without a Vercel alias, so V2.2-era references below to `demo-sass-2.vercel.app` are now dead links — substitute `rls-ai-shop.vercel.app` mentally. Entries are preserved verbatim because rewriting would misstate the URL at the V2.2 deploy moment.

## TL;DR

- **V1 (2026-04-30)** Hackathon → multi-merchant platform, 7 phases shipped, 81 tests.
- **V1.5 → V1.7** AI cost cap + admin scale + onboarding security. 81 → 154 tests.
- **V1.8 → V1.9** Portfolio docs + UI overhaul (brand tokens, theme system).
- **V2.0 (2026-05-04)** Per-merchant auth (email + password + DB sessions). 164 → 195 tests.
- **V2.1** 18 theme presets + brand-voice auto-match. 211 tests.
- **V2.2 (2026-05-04/05)** **Cloud deploy** — Vercel sin1 + Neon Singapore + R2 + Inngest Cloud. 4 critical + 7 high /autoplan blockers fixed. 256 → 260 tests. **Public on https://demo-sass-2.vercel.app at $0/mo idle.**
- **V2.3 (2026-05-05/06)** Throughput + tech debt + OSS readiness — Dependabot auto-merge, post-deploy smoke, branch protection, drizzle-orm 0.45 upgrade, real screenshots + walkthrough video, README clarity. 260+ tests.
- **V2.4 (2026-05-06)** Doc consolidation — README trimmed to entry surface, "Why interesting" promoted above the fold, security 30-sec synthesis added, Tests table moved to ARCHITECTURE §7, BUILD_DAY archived. CLAUDE.md hard rules #4/#6 fixed; common-errors cookbook added.
- **V2.5 (2026-05-06)** Agent-routing observational note codified in DECISIONS.md (B-minus per 4-voice consensus), with built-in 2026-08-01 expiry clause if not referenced by then.
- **V2.6 (2026-05-06)** **First distribution-first sprint.** Vercel Analytics with PII `beforeSend` filter (35 unit tests), ESLint allowlist narrowed from `(merchant)/**` + `(storefront)/**` glob to 3 exact-file exceptions (closes Codex CRITICAL doc-drift bug), 2 user-facing `dbAdmin` → `dbUser` refactors, `ai_usage_events` cross-tenant deny test, blog post `docs/blog/compile-time-tenant-isolation.md` with source-anchored snippets, blog drift checker T4. **90-day sunset gate at 2026-08-06 (issue #27)** — `< 50 unique non-operator visitors AND < 2 inbound contacts → V2.7 = archive`. 260 → 275 tests.
- **V2.6.x Tier 1 (2026-05-07)** Backlog cleanup — dbUser compile-time enforcement (fail-closed sister of V2.6 PR2's dbAdmin work; prevents the "switch-to-dbAdmin-to-debug-zero-rows" leak), `workflow_dispatch` GH Action so operator can run AI vision smoke from GH UI without local Docker/dev/Inngest setup (~$0.02/run, manual trigger), `generateObject` → `generateText + Output.object` AI SDK v6 deprecation migration (verified post-merge against real OpenAI, `tokens_in > 0` assertion fired in 36.8s). 275 → 304 tests (drift-checker reconciled badge). **V2.6 release tag cut (`v2.6` → `ebde79d`)** covering V2.4 → V2.6.x Tier 1.
- **V2.6.x Rename (2026-05-08)** Product-name unification `demo-sass-2` → `rls-ai-shop` matching the V2.6 RLS-template thesis. Three-PR sweep: PR #50 product name (package.json / Inngest client id / xlsx metadata / docs), PR #51 surrounding identifiers (Vercel domain forward-looking refs / Docker container + volume / local DB name / CI DB name / GH repo URL refs), PR #52 dead-URL footnotes preserving V2.2-era CHANGELOG entries verbatim. Operator UI follow-ups completed same day: Vercel project + new domain `rls-ai-shop.vercel.app`, GH repo rename, Inngest dashboard new app sync (Event/Signing keys reused — environment-scoped), local brew-postgres `ALTER DATABASE`. Prod Neon DB stayed `neondb` (always was — DEPLOY.md `demo_sass_2` was prescriptive, never live state). End-to-end verified via manual smoke (run 25533410568, 38.3s, $0.02 OpenAI).

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
| V1.8 | 2026-05-01 | Portfolio docs (README + ARCHITECTURE + STATUS + CHANGELOG) | 154 | — | `cc7c3c9` |
| V1.9 | 2026-05-01 | UI overhaul — token foundation + brand identity + polish + whimsy | 154 → 160 | — | `39a8640` |
| V1.9.1 | 2026-05-04 | Stock edit + input/textarea brand-radius bugfixes | 160 → 164 | — | `4c762de` |
| V2.0 | 2026-05-04 | Per-merchant authentication (email + password + DB sessions) | 164 → 195 | 0008 | `f96e02e` (PR #1) |
| V2.1 | 2026-05-04 | 18 theme presets + brand-voice auto-match + radius save fix | 195 → 211 | — | `6da0489` |
| V2.1.2 | 2026-05-04 | Preset dropdown 持久顯示 + theme FOUC 消除 (server-render `<style>`) | 211 | — | `1897aac` |
| V2.2 | 2026-05-04/05 | Cloud hardening sprint — fix all 4 critical + 7 high /autoplan blockers | 211 → 256 | renamed 0001→0001a | `58ca815` (PR #2) |
| V2.2.11 | 2026-05-05 | Inngest worker payload guard (post-deploy hotfix) | 256 → 260 | — | (PR #3) |
| V2.2.12 | 2026-05-05 | Frontend poll budget 45s → 180s (cold start tolerance) | 260 | — | (PR #4) |
| V2.2.13 | 2026-05-05 | Image URL fix — IMG src now uses imageUrlFor() not hardcoded /uploads/ | 260 | — | (PR #5) |
| V2.2.14 | 2026-05-05 | Live demo badge + V2.2 docs entry | 260 | — | (PR #6) |
| **V2.2 cloud deploy** | **2026-05-05** | **Public on https://demo-sass-2.vercel.app — Vercel sin1 + Neon Singapore + R2 APAC + Inngest Cloud** | | | |
| V2.3 | 2026-05-05/06 | Throughput + tech debt + OSS readiness — Dependabot auto-merge, post-deploy smoke, BP gate, drizzle 0.45 upgrade, screenshots + walkthrough, README clarity | 260+ | — | PRs #7–#22 |
| V2.4 | 2026-05-06 | Doc consolidation — trim README, promote "Why interesting", security 30-sec synthesis, archive BUILD_DAY, CLAUDE.md fixes, common-errors cookbook | 260+ | — | (PR #25) |
| V2.5 | 2026-05-06 | Agent-routing observational note in DECISIONS.md (B-minus consensus, 2026-08-01 expiry) | 260+ | — | (PR #26) |
| V2.6 PR1 | 2026-05-06 | Vercel Analytics + `beforeSend` PII filter + sunset gate issue #27 + T5 cleanup | 260 → 274 | — | (PR #28) |
| V2.6 PR2 | 2026-05-06 | ESLint allowlist narrowed to 3 exact-file exceptions + 2 dbAdmin→dbUser refactors + doc-drift fix + T9 ai_usage_events RLS | 274 → 275 | — | (PR #29) |
| V2.6 PR3 | 2026-05-06 | Blog post `compile-time-tenant-isolation.md` + blog drift checker T4 | 275 | — | (PR #30) |
| **V2.6 distribution sprint** | **2026-05-06** | **First sprint that ships external signal infra. 90-day sunset gate set 2026-08-06.** | | | |
| V2.6.x #4 | 2026-05-07 | dbUser ESLint ban + 2 merchant page refactors via `withTenantTx` + blog snippet sync | 275 | — | (PR #45) |
| V2.6.x #7 | 2026-05-07 | `workflow_dispatch` GH Action for AI vision smoke (manual operator trigger, ~$0.02/run) | 275 | — | (PR #46) |
| V2.6.x #5 | 2026-05-07 | `generateObject` → `generateText + Output.object` AI SDK v6 deprecation migration | 275 | — | (PR #47) |
| V2.6.x docs | 2026-05-07 | Tier 1 backlog wrap-up (STATUS / CHANGELOG / test badge) + dbAdmin/dbUser narrative refresh | 304 | — | (PRs #48, #49) |
| **V2.6 release tag** | **2026-05-07** | **Tag `v2.6` → `ebde79d` covering V2.4 → V2.6.x Tier 1. GH release published (`Latest`).** | | | |
| V2.6.x rename | 2026-05-08 | `demo-sass-2` → `rls-ai-shop` product unification. PR #50 product name, PR #51 surrounding ids (Vercel domain / Docker / DB), PR #52 dead-URL footnotes | 304 | — | (PRs #50, #51, #52) |
| **V2.6.x rename complete** | **2026-05-08** | **Operator UI sweeps done same day: Vercel + GH + Inngest + local brew-postgres `ALTER DATABASE`. Verified via run 25533410568 (38.3s, $0.02).** | | | |

Bottom line: **300+ vitest tests, GitHub Actions CI on every PR, public URL live at `rls-ai-shop.vercel.app`.**

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

## V1.8 — Portfolio docs (`cc7c3c9`)

**Why this version**: After 4 sprints of internal hardening, the repo had 141 tests and zero discoverable narrative. Recruiters / engineers landing on the repo couldn't see scope or quality in 30 seconds. Pure docs sprint.

**Shipped**:

- `README.md` (882 words, 1 Mermaid) — entry point. Stack badges, 7 feature bullets, system overview diagram, quickstart, "Why this is interesting" with 6 concrete engineering callouts.
- `ARCHITECTURE.md` (2356 words, 4 Mermaid) — engineer-depth: ER diagram, multi-tenant RLS, AI pipeline sequence, admin observability flow, security layers, frontend patterns.
- `STATUS.md` — this file. Replaces older `V1_STATUS.md`.
- `CHANGELOG.md` (1931 words) — git log distilled, 3-7 bullets per major commit.
- `LOCAL_SETUP.md` rewrite (was stale: pnpm/Homebrew/R2-references; now Docker + bun + V1.7-aware).

**Notable decisions**:

- README is recruiter-first, engineer-second (first 30s skim then deeper).
- ARCHITECTURE.md doesn't water down — assumes engineer audience.
- STATUS.md narrative + numbers, not just numbers ("Why this version" + "Notable decisions" + "Process" per entry).
- Code claims grounded in source (file paths, line numbers, actual test counts). No fabricated APIs.
- TW Chinese reserved for direct UI quotes only (「商家行動清單」, 「暫停營業中」).

**Process**: Single Technical Writer agent dispatch. Verified every claim against source files before writing.

**Tests**: unchanged (154).

---

## V1.9 — UI overhaul (`39a8640`)

**Why this version**: User asked "UI 還是不夠漂亮". Dispatched 4-agent design audit (UI Designer + UX Architect + Brand Guardian + Whimsy Injector) → synthesized into 3-tier ranked action list → executed across 3 sequential implementation agents.

**Audit findings**:

- UI Designer: 6.5/10, "competent SaaS demo" not "TW indie marketplace"
- UX Architect: token system bypassed in admin (`bg-zinc-*` leak)
- Brand Guardian: Linear clone, no wordmark, generic palette
- Whimsy Injector: AI 7s wait was anxiety not "watch the magic"

**Shipped (Tier 1 Foundation, UX Architect)**:

- 18 semantic tokens in `:root`: `--brand-tint-{3,8,14}`, `--brand-edge-{12,18,28}`, `--bg-card`, `--ink-muted`, `--status-{success,error,warning,info}-{soft,edge}`.
- shadcn alias bridge: `--background`, `--primary`, `--card`, `--border` all alias to `var(--brand-*)` — no more parallel theme universe.
- ESLint rule: blocks `bg-zinc-*` / `bg-amber-50` / hardcoded oklch in `src/app/(admin|merchant|storefront)/**`. Caught 150 violations across 13 files first run, all fixed.
- `<StatusChip>` primitive in `src/components/ui/StatusChip.tsx` replaces 5 forked chip implementations.
- `/admin/page.tsx` + `/admin/queue/page.tsx` + `/admin/cost/page.tsx` migrated to semantic tokens.

**Shipped (Tier 2 Brand identity, Brand Guardian)**:

- Wordmark "Catalogify" Inter 700 + stacked-rectangle glyph in 柿色 `#D97757` (`src/components/platform/Wordmark.tsx`).
- `src/app/icon.tsx` for favicon (Next 15 ImageResponse).
- `.platform` palette warm-shifted: `#18181B` → `#1A1614` (warm-black), `#FAFAFA` → `#FAF8F3` (paper-warm), introduced `--platform-accent` 柿色.
- `MerchantCard`: 4px brand color stripe at top from `m.themeVars` + hover-lift + GMV typography fix.
- Storefront: 32px platform footer wrapped in `.platform` forces Linear-tone — customers see "由 Catalogify 提供" trust signal.
- Tagline rewrite: `「拍一張照, 60 秒上架; 不切後台, 不開 Excel — 把時間還給做產品的人。」` (TW全形標點).
- Homepage hero: stat strip 變大 (2xl tabular-nums merchants/products/60s) + 5-emoji merchant peek.

**Shipped (Tier 3 Polish + whimsy, UI Designer + Whimsy Injector)**:

- Storefront product grid: removed `boxShadow` inline (was killing `.hover-lift`), bumped radius 1×→2× brand-radius, top-corners radiused image wrapper, group-hover scale 1.04, price uses brand serif.
- EmptyState migration to `feedback/EmptyState` (5 sites): storefront / merchant products / orders / dashboard top products + recent orders.
- Icon stroke audit: 5 widths → 3 canonical (1.8 / 2.0 / 2.2) + hero 1.5. Final tally: 65× 2.2, 17× 2.0, 5× 1.5, 3× 1.8 across ~25 files.
- Whimsy quick wins: empty arrow-dance on `/merchant/products` + 3-title rotation; customer order confirmation merchant-voiced thank-you (`src/lib/brand-voice/thank-you.ts` heuristic 4-voice tone mapper); AI 7-second scan-line + rotating reassurance copy ("正在看你的照片..." → "判斷材質中..." → "想商品名稱中..." → "寫品牌語氣文案中..." every 2.5s).

**Notable decisions**:

- ESLint rule is the keystone — without enforcement, the next contributor adds another `bg-zinc-100`. Carrot (tokens) + stick (lint) shipped together.
- Kept shadcn (didn't migrate everything custom) — bridged via `:root` alias, so future shadcn additions inherit brand vars.
- `tone="brand" | "neutral"` prop pattern from B4 was acknowledged half-done by UX Architect; commit was made to NOT spread further (would entrench wrong abstraction).
- 17 existing whimsy keyframes; only 3 needed activation (most were already wired). Restraint over additions.

**Tests**: 154 → 160 (+6 brand-voice unit tests).

---

## V1.9.1 — Stock edit + input radius bugfixes (`4c762de`)

**Why this version**: Two user-reported bugs after V1.9 ship.

**Bug 1 — 商品沒辦法改庫存**:
- `updateProductAction` only accepted `title/description/priceCents` (no `stockQuantity`).
- `EditableProductFields` had no stock input.

**Fix**: Extended action patch type with `stockQuantity?: number` + integer validation (0-99999, reject `.5` / negative / overflow). Added stock input alongside price (2-col grid sm+, stacked mobile). Added "目前庫存" `<StatusChip>` on detail page (error/warning/neutral based on `lowStockThreshold`). 4 new tests in `tests/products/stock-edit.test.ts`.

**Bug 2 — 圓角 input 內含元素超出擠壓外框**:
- shadcn `Input` + `Textarea` hardcoded `rounded-lg` (8px), but `--brand-radius` is 2px (akami serif) / 4px (platform). Visual mismatch + focus ring/3 box-shadow rendered at 8px radius escaping the actual visual border.

**Fix**: `rounded-lg` → `rounded-[var(--brand-radius)]`. Now follows merchant brand identity, focus ring stays inside.

**Tests**: 160 → 164 (+4 stock-edit).

**Note**: Cleaned 1 stale `photo_upload` event from `stylish-man` tenant left over from V1.5 cost-tracking smoke testing — was polluting platform-wide cost aggregation tests.

---

## V2.0 — Per-merchant authentication (`f96e02e`, PR #1)

**Why this version**: V1.7 review side-find: 「商家後台應該每個商家有自己的認證, 而不是共用 demo-merchant-id cookie」. The `demo-merchant-id` cookie pattern was fine for hackathon-era 5 demo merchants but breaks the moment real merchants sign up — anyone with that cookie could access any merchant. Fixing this is a structural prerequisite for V2 cloud deploy + payments. **First sprint shipped via PR-based workflow** (per V1.9.1 git workflow upgrade).

**Shipped (5 sequential agency-agent tasks on `v2-merchant-auth` branch)**:

**Task 102 — Schema (Backend Architect)**:
- Migration 0008: `merchants.email` + `password_hash` + `merchant_sessions` table with `revoked_at` column.
- Functional unique index on `lower(email)`.
- RLS deny-all to `web_anon`, `web_admin` SELECT/INSERT/UPDATE only.
- `bcryptjs@3.0.3` added.
- `scripts/seed-merchant-auth.ts` backfills 7 demo merchants (email = `{slug}@demo.local`, password = `demo1234`).

**Task 103 — Auth core lib (Security Engineer)**:
- `src/lib/merchant-session.ts` (Node runtime, DB-coupled): `signSessionCookie` / `verifyCookieSignature` (timing-safe HMAC), `validateMerchantSession` (DB row + `revoked_at` + `expires_at` check), `loginMerchant` (bcrypt + username-enumeration defense via fake-hash constant-time fallback; status checks revealed only AFTER password match), `revokeMerchantSession` (UPDATE `revoked_at`, preserves audit trail).
- `src/lib/merchant-session-edge.ts` (Edge runtime, Web Crypto): pure-crypto verifier for middleware.
- `middleware.ts`: gates `/merchant/*` (skips `/login` + `/signup` + `/logout`), 503 if `MERCHANT_SESSION_SECRET` missing.
- `MERCHANT_SESSION_SECRET` added to `.env.local` (64 hex chars).

**Task 104 — Login + signup + onboarding (Frontend Developer)**:
- `/merchant/login` page + `LoginForm` + `actions` (mirror `/admin/login`).
- `/merchant/logout` route handler (POST-only, revokes DB session, clears cookies, idempotent on stale).
- `/onboarding` extended: email + password + confirm fields, bcrypt hash on save, email lowercase + unique-violation handling.
- V1.7 D1 honeypot + reserved-slug + IP rate-limit fully preserved.
- Layout: simple "merchant name + 登出 button" header (V1.7 D2 `MerchantSwitcher` concept obsolete).

**Task 105 — Migrate consumers + remove switcher (Backend Architect)**:
- `resolveMerchantFromCookie()` rewritten — no args, reads `merchant-session`, validates, redirects to `/merchant/login` on failure.
- 17 caller sites migrated (pages + API routes + server actions).
- `(merchant)/layout.tsx` adds DB session validation (E11 pattern).
- DELETED: `src/components/theme/MerchantSwitcher.tsx`, `src/app/(merchant)/merchant-switcher/{page,SearchInput,SwitchRow}.tsx`, `src/lib/storage/demo-merchants.ts` (V1 hardcoded `DEMO_MERCHANTS` dict), `tests/merchant-switcher.test.ts`.
- Legacy `demo-merchant-id` cookie reads removed everywhere. Transitional cookie set during task 104 also removed.

**Notable decisions**:

- Username enumeration defense via constant-time bcrypt against fake hash — even non-existent emails take same time to fail.
- Suspended/pending status revealed only AFTER password match — prevents probing arbitrary emails to learn account states.
- `revoked_at` column (not present in `admin_sessions`) — enables logout-via-UPDATE instead of DELETE, preserves audit trail. V2.1 can add "logout all devices" via `UPDATE … SET revoked_at = now()`.
- Email functionally lowercase-unique via partial unique index. Auth lib `.toLowerCase()` on lookup.
- `MerchantSwitcher` (V1.7 D2) deleted entirely — concept obsolete with per-merchant auth (商家只看自己的, 不切).

**Tests**: 164 → 195 (+31 net: +26 merchant-auth + 9 login flow + 4 stock-edit minus 4 switcher).

**Process**: First sprint on **feature branch with PR + squash-merge** (per V1.9.1 user request to upgrade git workflow). PR #1 opened, self-reviewed, squash-merged with `--delete-branch`, then tagged `v2.0`.

**Out of scope (V2.1 candidates)**:
- Password reset flow (needs Resend / email infra)
- "Remember me" longer session
- Multi-user-per-merchant (V2 = 1 user per merchant)
- OAuth / 2FA

---

## V2.1 — Theme presets + radius save fix (`6da0489`)

**Why this version**: Two user reports after V2.0 ship.

**Bug — /merchant/settings 圓角風格 save 後無效**:
- `SettingsForm` `useTransition` saved successfully but client didn't re-apply CSS vars. ThemeProvider's `useEffect` keyed off `current` object reference — even when themeVars changed, the dep didn't fire.
- **Fix**: switched ThemeProvider deps to `JSON.stringify(current.themeVars)` so any value change in the 5 brand vars triggers re-application. `router.refresh()` was already in handleSubmit success path (committed earlier in `69ef3447`); the residual issue was the deps key.

**Feature — 18 theme presets + brand-voice auto-match**:

Previous state: `THEME_PICKS` array in onboarding had 3 themes, picked randomly. User asked for ≥16 themes + auto-assigned by brand voice.

**Shipped**:

- `src/lib/themes/presets.ts` — 18 `ThemePreset` entries: `quiet-japanese / night-market / literary-cafe / streetwear / tea-shop / modern-minimal / pink-sweet / earth-farmer / island-resort / handcraft / kawaii-stationery / vintage-retro / tech-ecom / florist / fitness / dessert-bakery / bookstore / outdoor-sport`. Each has 5 themeVars + 3-7 中文 keywords for matching.
- `src/lib/themes/match.ts` — `pickThemeForVoice(brandVoice)` keyword-substring scoring + stable tiebreak + fallback `modern-minimal`. `getThemeById(id)` lookup.
- `src/app/onboarding/actions.ts` — replaced random `THEME_PICKS` pick with `pickThemeForVoice(brandVoice)`. V1.7 D1 honeypot/reserved/rate-limit fully preserved.
- `src/app/(merchant)/merchant/settings/SettingsForm.tsx` — added 「套用預設主題」 dropdown above the color/radius/font fields. Picking a preset overwrites all 5 form state fields at once; dropdown self-resets to `""` so it acts as an apply trigger.

**Notable decisions**:

- Keyword matching (not Gemini call) — AI-cost-conscious, deterministic, fast. Brand voice is free text per V1 schema, so no enum dependency.
- 18 presets > 16 minimum (extras provide better coverage of TW indie shop archetypes: 文青/夜市/手作/潮男/小農/手搖飲品/etc).
- ThemeProvider deps fix is defensive — protects against future preset-dropdown-driven multi-field state churn, not just this exact bug.

**Tests**: 195 → 211 (+16: keyword matcher coverage, preset structure validation, brand voice → theme assignment for 8 distinct vibe inputs).

**Process notes**:
- Sub-agent pushed directly to `main` (skipped feature branch + PR workflow we set up in V2.0). Future sprints should use feature branch + PR per the established convention.
- Dev server HMR cache went stale after the major edits (themes lib + ThemeProvider) — required restart before integration tests passed. Recurring pattern; consider documenting as a known dev-time gotcha.

---

## V2.1.2 — Preset dropdown 持久 + theme FOUC 消除 (`1897aac`)

**Why this version**: Two follow-up issues from V2.1 walk-through.

**Issue 1 — 套用預設主題後 dropdown 還顯示「自訂(不套用)」**:
- Old: `<select defaultValue="">` (uncontrolled) + onChange 套完手動 `e.target.value = ''` 重設.
- User read this as "didn't apply" because copy literally said "不套用".

**Fix**: Track `appliedPresetId` in state. Dropdown becomes controlled `<select value={appliedPresetId}>`. Initial state detects if current themeVars match a preset (existing demo merchants 5/5 match, so dropdown shows their preset on first load). Manually editing any of 5 fields (color/radius/font) → `setAppliedPresetId('')` reverts to "自訂". Copy updated: removed misleading "(不套用)" qualifier.

**Issue 2 — Theme FOUC on page nav / refresh**:
- Old: `ThemeProvider` applied themeVars in client `useEffect` → first paint used default light theme → 1-frame flicker.

**Fix**: Server-render an inline `<style>:root { --brand-* }</style>` in `(merchant)/layout.tsx` and `(storefront)/store/[slug]/ThemeForStore.tsx`. `ThemeForStore.tsx` rewritten as a server component (dropped `'use client'` + `useEffect`) — it now just emits the inline style. Browser parses CSS before JS runs, so first paint is correct. `ThemeProvider`'s `useEffect` still runs as fallback for client-side state changes (preset dropdown).

**Tests**: unchanged (211).

**Note**: HMR cache went stale after `ThemeForStore.tsx` switched from client → server component; required a dev server restart. Recurring pattern; documenting as a known dev-time gotcha.

---

## V2.2 — Cloud hardening + public deploy (PR #2 → #6)

**Why this version**: Triggered by `/autoplan` to plan production deploy. Both reviewers (Codex + Claude subagent, two independent dual-voice rounds) flagged the same blocker: app code wasn't actually serverless-ready. 4 critical + 7 high findings, all in app code, none in deploy plan. V2.2 = the code work that had to land before any cloud target made sense.

**Sprint structure** — each sub-version is one self-contained commit on PR #2:

- **V2.2.0** Custom SQL migration runner — drizzle-kit's `_journal.json` only tracked 0000-0002. Hand-written RLS migrations (0001a_init_rls, 0003-0008) silently skipped. New `pnpm db:migrate` script reads every `drizzle/migrations/*.sql` in lex order, tracks in `__migrations__` table.
- **V2.2.1** Env zod validation + explicit SSL + serverless pool sizing — `src/lib/env.ts` fail-fasts on bad env at boot via `instrumentation.ts`. `pg.Pool` gets `ssl: { rejectUnauthorized: true }` in prod. `max=1` per pool in prod (each cold lambda creates own pool; was `max=5/3` × N warm = Neon connection storm).
- **V2.2.2** Demo merchant prod-mode security — `seed-merchant-auth.ts` now generates random per-merchant 16-char passwords + sets `suspendedAt=now()` when `NODE_ENV=production` or `--mode=prod`. Was hardcoded `demo1234` shared password = backdoor.
- **V2.2.3** Split `db/init/01-roles.sql` (LOCAL ONLY warning) from new `db/init/prod-roles.template.sql` using psql variable substitution (`-v web_anon_password=...`).
- **V2.2.4** R2 storage backend — `src/lib/storage/index.ts` facade dispatches by `STORAGE_BACKEND` env. New `src/lib/storage/r2.ts` uses `@aws-sdk/client-s3` server-side. `local-fs.ts` refactored to match the same interface. 4 call sites swapped (api/uploads, api/products/generate, inngest worker, import downloader).
- **V2.2.5** Vision async refactor — `POST /api/products/generate` now enqueues Inngest `product.ingest` event + returns `{ status: 'pending' }` in <1s (was sync 5-15s call that blew Vercel Hobby's 10s function timeout). New `GET /api/products/generate/status?storageKey=` polling endpoint. `GenerationStream.tsx` polls. Inngest worker writes `aiMetadata.source_key` so the route can correlate the async result back to the upload.
- **V2.2.6** pgBouncer transaction-mode compat verifier (`scripts/db/verify-pgbouncer.ts`) — 100 alternating tenant transactions through Neon's pooled endpoint, asserts RLS held throughout. Documents in `src/db/index.ts` why `set_config(..., is_local=true)` + transaction-pool mode is correct + why we don't need named prepared statements.
- **V2.2.7** Test gap fill — added `tests/health/api-health.test.ts` (4 cases) and `tests/products/generate-cap.test.ts` (2 cases). 256/256 total.
- **V2.2.8** ARCHITECTURE.md §4.4 — honest threat model for `web_admin` (BYPASSRLS) in user-facing runtime. Earlier docs claimed "RLS mitigates container compromise"; that was overstated. New doc states reality (Vercel function compromise = full DB), what we DO have (ESLint allowlist + per-call-site justification + suspend guard), and what stronger protection would require (separate runtime / stored procedures, deferred).
- **V2.2.9** Step-timing instrumentation in Inngest worker — `[step-timing]` log lines per step + warning above 9000ms (within 1s of Vercel Hobby cap).
- **V2.2.10** /autoplan v2 review fixes — 5 ship-blockers + should-fixes:
  - Renamed `0001_init_rls.sql` → `0001a_init_rls.sql` (collision with drizzle-gen `0001_*`)
  - `instrumentation.ts` clarifies it runs at cold start, not deploy gate
  - `seed-merchant-auth.ts` refuses dev-mode against non-local DB host
  - Preview env guard: `instrumentation.ts` throws if `VERCEL_ENV=preview && STORAGE_BACKEND=r2`
  - ARCHITECTURE.md §4.4 honesty extended to Inngest worker runtime
  - `GenerationStream.tsx` poll budget 30s → 45s (later bumped again in V2.2.12)

**Phase A — GitHub Actions CI** (`58c2014`, `9ee11a7`):
- `.github/workflows/ci.yml` runs on every PR + push to main. Postgres 16 service container, role bootstrap via V2.2.3 template, V2.2.0 db:migrate, lint, typecheck, build, full vitest. ~3m20s end-to-end.

**Phase B — Neon Singapore provisioning** (operator runs `DEPLOY.md`):
- Direct + pooled URLs, 10 migrations applied, 100-iter pgBouncer compat passes.

**Phase C — R2 + Vercel** (operator runs `DEPLOY.md`):
- Cloudflare R2 bucket with public r2.dev subdomain, scoped Account API token.
- Vercel project import, 17 env vars (Production scope), Function region pinned to `sin1`.

**Phase D — Inngest Cloud + smoke tests**:
- Inngest app `rls-ai-shop` synced against `https://demo-sass-2.vercel.app/api/inngest`.
- OpenAI hard cap $10/mo at vendor dashboard (defense in depth alongside app's `assertWithinDailyCap`).
- 15-step manual smoke checklist completed.

**Post-deploy hotfixes** (separate PRs):
- **V2.2.11** (PR #3) — Inngest worker payload guard. Post-sync introspection delivered an event with empty data; `assertSafeKey(undefined).includes('..')` threw `TypeError`. Added explicit guards in `r2.ts`, `local-fs.ts`, and `product-ingest.ts` handler. 4 new tests.
- **V2.2.12** (PR #4) — Frontend poll budget 45s → 180s. Production observed cold-start pipeline taking 1m24s (down from 3m1s after sin1 region change). 45s timeout was triggering fixture fallback even when worker succeeded. Added progressive UI hints at 30s and 90s.
- **V2.2.13** (PR #5) — Image URL fix. V2.2.4 swapped storage to R2 but JSX kept hardcoded `<img src={`/uploads/${r2Key}`}>`. Created `src/lib/storage/public-url-client.ts` `imageUrlFor()` (uses `NEXT_PUBLIC_R2_PUBLIC_URL`). 4 IMG src + 2 export utilities (shopee-csv, products-xlsx now produce absolute URLs) swapped.
- **V2.2.14** (PR #6) — README live demo badge + this STATUS entry + CHANGELOG entry.

**Production data observed** (sin1 + Neon Singapore + Inngest Cloud):
| State | Pipeline duration |
|---|---|
| First cold (iad1, broken region) | 3m 1s |
| First cold (sin1) | 1m 24s |
| Warm | ~30s estimated |

**Tests**: 211 → 260 (+49: migration runner, env validation, storage facade, generate-async, generate-cap, api-health, payload guard, image URL).

**Migrations**: 0001 renamed (one new file, no schema change). Total 10 forward + 9 rollback.

**CI**: GitHub Actions on every PR, 3m20s end-to-end. 256+ tests + lint + typecheck + build + ephemeral postgres.

**Cost at idle**: $0/mo (Vercel Hobby + Neon free + R2 free + Inngest free + OpenAI $10 hard cap).

**Process notes**:
- 6 PRs (#2 hardening + #3-#6 hotfixes). Hotfixes were caught in production smoke test, not CI — most were "code works locally but breaks under cloud-shape constraints (timeouts, env scopes, region latency)". CI can't easily catch these without integration against actual cloud services.
- Two `/autoplan` rounds + dual-voice review per round flagged most issues before deploy. The remaining 4 hotfixes were genuine "production teaches you new things" findings.
- DEPLOY.md (~500 lines) was written before Phase B/C/D execution and held up well — operator followed it click-by-click. Updated post-deploy with troubleshooting cases observed in practice.

---

## V2.6 — Distribution-first sprint (PR #28 → #30)

**Why this version**: Three retros in a row (V2.3, V2.4, V2.5) flagged the same finding — "external signal missing." Each next sprint deferred distribution work and shipped more internal polish (drift checker, doc clarity, agent routing). V2.6 is the first sprint where the operator stopped polishing and started broadcasting. Premise reframe accepted at the `/autoplan` premise gate: hook = tenant-boundary engineering (RLS + ESLint allowlist), NOT AI photo→listing (which is now commodity per Shopify Magic / Wix AI). Audience collapsed to one — technical hiring signal.

**Sprint structure** — three small PRs, each independently revertible:

- **V2.6 PR1** (#28) — Wired `@vercel/analytics` 2.0.1 with a load-bearing `beforeSend` PII filter. Pre-tenant-resolution operator IPs and PII-bearing URLs (`/admin/**`, `/merchant/**`, `/api/**`, `/store/*/order/*`, `/merchant/products/import/<uuid>`, any UUID-bearing path) are dropped at the SDK boundary. 35 unit tests pin the filter so a future refactor cannot silently re-enable PII collection. Created sunset-gate GitHub issue #27 with the 2026-08-06 decision criteria. Privacy page disclosure updated for PDPA hygiene. Caught a real bug during build: `<Analytics beforeSend={...} />` won't serialize across Next.js's server→client boundary; fix is the `AnalyticsClient` client-component wrapper. T5 cleanup landed: `tests/rls.e2e.test.ts:T3` second assertion converted to `expectRejectsMatching`. CI flapped once on regex (`postgres` role doesn't exist in CI env), one-line widening of the regex shipped in the same PR.

- **V2.6 PR2** (#29) — Closed Codex's CRITICAL doc-drift finding from the `/autoplan` eng review. README + ARCHITECTURE.md claimed "UI code physically cannot bypass tenant isolation" but `eslint.config.mjs` allowlisted `(merchant)/**` + `(storefront)/**` wholesale, and 5 user-facing files actually imported `dbAdmin`. Either the claim shrinks or the surface shrinks; the PR shrinks the surface. The 2 read-only call sites (`settings/page.tsx`, `products/page.tsx`) refactored to `dbUser` (web_anon has SELECT on `merchants`; no RLS policy means no tenant scoping needed for the merchant-self read). The 3 remaining call sites that genuinely need BYPASSRLS — `(merchant)/layout.tsx` for cookie→merchant lookup, `(storefront)/store/*/layout.tsx` for slug→merchant lookup, and `settings/actions.ts` for the merchants-table UPDATE path — added to the allowlist by exact file path with one-line justifications. README + ARCHITECTURE.md §2 + §4.3 + CLAUDE.md hard-rule #5 all rewritten to match the 3-narrow-exception reality, plus a new "ESLint rule limits to acknowledge" paragraph names the 4 known bypass routes (module-specifier exact match, dynamic computed `import()`, re-export laundering, `eslint-disable` comments). T9 added to `tests/rls.e2e.test.ts` — `ai_usage_events` cross-tenant deny — closing Codex's #6 RLS coverage gap. Glob trap caught locally: `[slug]` is a minimatch character class, switched to `*`.

- **V2.6 PR3** (#30) — Blog post `docs/blog/compile-time-tenant-isolation.md` (~280 lines, 5 source-anchored snippets via `<!-- src: path:line-line -->` markers). Sells the stack of layers (RLS WITH CHECK + `withTenantTx` UUID guard + ESLint allowlist + cross-tenant deny tests + role-escalation deny test), names the 4 ESLint bypass routes up front, frames the rule as a pragmatic boundary guard rather than novel RLS architecture. Drift checker T4 extends `scripts/check-readme-drift.ts` to scan `docs/blog/*.md` for source markers and assert snippet content matches verbatim — same drift-class V2.4 caught for README. Negative test verified: temporarily mutating one snippet fired the checker with file:line + first-diff hint.

**Operational setup** (post-merge, manual):
- ✅ Vercel Web Analytics enabled on the project.
- ✅ Operator IP exclusions configured in Vercel dashboard (otherwise the 90-day gate gives a wrong read — operator + smoke traffic dominates). Smoke workflow only hits `/api/health` which is dropped by `beforeSend`, so no GitHub Actions runner IP exclusion needed.
- ✅ Privacy page disclosure live on prod (`/privacy` returns 200 with disclosure text).
- ✅ Sunset gate issue #27 commented with setup confirmation + 2026-05-07 health-check checklist.

**90-day sunset gate** — issue #27, decision date 2026-08-06:
- `< 50 unique non-operator visitors AND < 2 inbound contacts → V2.7 = archive` (write a post-mortem README, move on).
- `≥ 50 visitors OR ≥ 2 inbound contacts → V2.7 = continue distribution` (with what worked / what didn't from this window).

**Tests**: 260 → 275 (drift-checker static count). PR1 added `tests/observability/analytics-filter.test.ts` (35 vitest cases — most via `it.each(...)` which the heuristic counts as a single entry, hence the smaller static delta), PR2 added T9 to `rls.e2e.test.ts`, PR3 added zero tests but the drift checker now also scans blog snippets.

**Process notes**:
- Sprint budget was B+Spike (~2.5 days CC). Actual: 3 PRs in roughly 2 hours of CC time, compressed because `/autoplan`'s eng-phase Codex review caught the doc-drift bug as CRITICAL early — PR2 ended up bigger but cleaner than the original "narrow allowlist" plan suggested.
- The blog post is in repo but not yet **distributed**. The V2.6 thesis is only fully tested when the post lands on dev.to / r/programming / Drizzle Discord (and possibly HN on a Tue/Wed ET morning) and analytics start showing real referrers. That's the operator-hand work the gate measures.
- Optional positioning spike (`spike/template-positioning` branch with `README-as-template.md` reframing the repo as `rls-multitenant-template`) is in the V2.6 plan but deliberately unmerged — it's a V2.7 input signal, not V2.6 ship surface.

---

## Known limitations (still applies)

- **No real payment gateway** — checkout walks a 「客服收款」 flow (待付款 status flipped manually by merchant). Schema has `payment_webhooks` + `ecpay_trade_no` ready for V2.
- **No real shipping integration** — `tracking_number` / `carrier` are plain text; no 7-11 / 黑貓 API.
- **No email/SMS notifications** — status changes write to audit log only.
- **AI import requires OpenAI key + Inngest dev CLI** for end-to-end local dev (`bunx inngest-cli dev`). Production uses Inngest Cloud.
- **Cold start UX** — first request of the day takes 60-90s on Vercel Hobby + sin1. Acceptable for portfolio; pre-warm cron or Vercel Pro would mitigate.
