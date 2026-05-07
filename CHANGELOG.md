# Changelog

Commit-level history for `demo-sass-2`. Per-version narrative + numbers in [STATUS.md](./STATUS.md). Architecture context in [ARCHITECTURE.md](./ARCHITECTURE.md).

Format: every entry is one Git commit with SHA + date + subject + bullet expansion. Trivial commits (merge / formatting) are skipped.

> **Doc role** (V2.4 forward-only): CHANGELOG = mechanical commit-level *what*. STATUS = per-version theme + numbers + rationale (*why*). Existing V1–V2.3 entries retain mixed-style content (not retroactively reclassified — that surgery was deemed too risky in the V2.4 retro).

---

## V2.6.x Tier 1 #5 — 2026-05-07 (PR #47) — `f401b80`

**refactor(ai): migrate generateObject → generateText + Output.object**

- `src/lib/ai/vision.ts`: `generateObject({ schema })` → `generateText({ output: Output.object({ schema }) })`. AI SDK v6 marks `generateObject` as `@deprecated` (see `node_modules/ai/dist/index.d.ts:5223` — "Use generateText with an output setting instead"). Behavior is identical: same LLM call, same Zod-validated `ProductOutput`, same retry surface, same `normalizeUsage()` token plumbing.
- Field rename in lockstep: `result.object` → `result.output`. `result.usage` shape unchanged (`normalizeUsage()` still owns the v4/v5/v6 shape adapter).
- `tests/ai/cost-cap.test.ts`: mock updated from `generateObject: vi.fn()` to `generateText: vi.fn()` with matching `output: ...` field, plus `text: ''` and `content: []` for shape completeness.
- `src/lib/ai/prompt.ts`: docstring mention updated for symmetry.
- `NoObjectGeneratedError.isInstance()` retry trigger still works — the SDK throws it on JSON-parse / Zod-validate failures under either entry point.
- Verified end-to-end via `gh workflow run "AI vision smoke (manual)"` against `main` post-merge: 36.8s real OpenAI call, `tokens_in > 0` + `tokens_out > 0` assertions both fired (~$0.02 spend). Catches the silent-zero failure mode if a future SDK bump renames the token shape again.

---

## V2.6.x Tier 1 #7 — 2026-05-07 (PR #46) — `dd9a72f`

**feat(ci): workflow_dispatch action to run AI vision smoke from GH UI**

- New file `.github/workflows/ai-vision-smoke-manual.yml` — promotes `tests/smoke/ai-vision-local.smoke.ts` to a manually-triggerable GitHub Action. Operator can now run the full end-to-end vision smoke from the Actions tab (or `gh workflow run "AI vision smoke (manual)"`) without needing Docker postgres + dev server + Inngest CLI on their local machine.
- Manual trigger only — never on push/PR. Cost ~$0.02 per run (one GPT-4o vision call). V2.6.2 retro showed the local script catches regressions roughly once per SDK-major bump, not weekly; scheduled runs would burn ~$7/yr to find bugs that only exist after operator-initiated dependency upgrades. workflow_dispatch matches the actual failure cadence.
- 15 steps mirror `ci.yml` env shape: postgres 16 service, RLS roles via `prod-roles.template.sql`, `pnpm db:migrate`, demo merchant rows seeded inline (verbatim from `LOCAL_SETUP.md` step 4 to keep the workflow self-contained), `seed-merchant-auth.ts --mode=dev` for bcrypt password backfill, dev server + Inngest CLI dev started in background, `pnpm test:smoke:ai-local` (preflight + Playwright), trace + server log upload on failure.
- One-time operator setup: `Settings → Secrets → Actions → New repository secret` named `OPENAI_API_KEY_SMOKE`. Step 1 of the workflow fail-fast asserts the secret is non-empty, avoiding a 90s Playwright timeout on a fake-key 401.
- First post-merge run: 2 min 21 sec wall, all 7 preflight checks + 2 Playwright tests green.

---

## V2.6.x Tier 1 #4 — 2026-05-06/07 (PR #45) — `f65f9b1`

**feat(lint): dbUser compile-time enforcement + refactor 2 merchant reads**

- `eslint.config.mjs`: extended the `no-restricted-imports` rule from banning `dbAdmin` only to banning **both** `dbAdmin` AND `dbUser` from `@/db`. Closes the V2.6.2 `/autoplan` Codex review's identified sister failure mode: developer reaches for `dbUser` directly inside a user-facing route, RLS GUC isn't set, every query fail-closes to 0 rows, "fix" is to switch to `dbAdmin` — which IS the leak. New required path for any tenant-scoped read: `import { withTenantTx } from '@/lib/db/with-tenant'`.
- Allowlist for `dbUser` is broader than `dbAdmin`'s because (a) `withTenantTx` wrapper IS dbUser-based (added `src/lib/db/with-tenant.ts` to allowlist), (b) health checks ping the pool, (c) RLS tests exercise raw role behavior, (d) merchants-table reads are legitimate (no RLS policy on that table — storefronts cross-query for theme).
- `src/app/(merchant)/merchant/settings/page.tsx`: refactored from direct `dbUser.select()` to `withTenantTx(current.tenantId, async (tx) => tx.select()...)`. Read query result identical (merchants has no RLS policy), but the import path no longer triggers the lint rule and the developer-facing pattern is now uniform across all tenant-scoped reads.
- `src/app/(merchant)/merchant/products/page.tsx`: same refactor for the `lowStockThreshold` lookup, removed `dbUser` import.
- `docs/blog/compile-time-tenant-isolation.md`: snippet marker `<!-- src: eslint.config.mjs:27-48 -->` shifted to `:49-70` (file-header comment block extended), snippet body updated to reflect the dual ban + new message string. Surrounding prose now explains the dbUser failure mode (skip wrapper → fail-closed 0 rows → dev "fixes" by switching to dbAdmin → THAT is the leak). The blog drift checker T4 (V2.6 PR3) caught the divergence on first push, working as intended.
- Verified: `pnpm typecheck` + `lint` + `lint:docs` + `vitest run` all green pre-merge.

---

## V2.6 PR3 — 2026-05-06 (PR #30) — `310d155`

**docs(v2.6): blog post 'Compile-time tenant isolation' + drift checker T4**

- New file `docs/blog/compile-time-tenant-isolation.md` (~280 lines) — flagship V2.6 artifact. Frames the ESLint allowlist as one rung in a stack of layers (RLS WITH CHECK + `withTenantTx` UUID guard + ESLint rule + cross-tenant + role-escalation tests), names the 4 known ESLint bypass routes up front (module-specifier exact match, dynamic computed `import()`, re-export laundering, `eslint-disable` comments).
- 5 code excerpts anchored via `<!-- src: path:line-line -->` markers: `eslint.config.mjs:27-48`, `drizzle/migrations/0001a_init_rls.sql:37-40`, `src/lib/db/with-tenant.ts:7-31`, `tests/rls.e2e.test.ts:103-129` (T2), `tests/rls.e2e.test.ts:137-142` (T3).
- `scripts/check-readme-drift.ts` §8 — blog snippet drift checker (T4 from the V2.6 test plan). Walks `docs/blog/*.md` for source markers, reads the actual file at the specified line range, asserts snippet matches verbatim. On mismatch prints `file:line` + first-diff hint pointing to the divergent line. Single-line marker form (`:42`) and range form (`:42-50`) both accepted.
- Negative test verified: mutating one snippet fired the checker with the diff hint; reverting restored green.

---

## V2.6 PR2 — 2026-05-06 (PR #29) — `3dba632`

**chore(v2.6): narrow ESLint allowlist + close doc-drift bug + add T9 RLS test**

Closes Codex's CRITICAL doc-drift finding from the V2.6 `/autoplan` eng review.

- `eslint.config.mjs`: removed `'src/app/(merchant)/**'` and `'src/app/(storefront)/**'` glob allowlist entries. Added 3 exact-file entries with one-line justifications:
  - `'src/app/(merchant)/layout.tsx'` — cookie → merchant lookup before `withTenantTx` context exists
  - `'src/app/(storefront)/store/*/layout.tsx'` — slug → merchant resolution before tenant context exists (wildcard `*` instead of `[slug]` because minimatch parses brackets as char-classes)
  - `'src/app/(merchant)/merchant/settings/actions.ts'` — UPDATE on `merchants` table (web_anon has SELECT but not UPDATE on that table; merchants intentionally has no RLS policy because storefronts cross-query for theme/name)
- File-header comment rewritten to list the full allowlist with category-grouped reasons.
- `(merchant)/merchant/settings/page.tsx` + `(merchant)/merchant/products/page.tsx`: refactored read-only queries from `dbAdmin` → `dbUser`. Both are SELECT on `merchants` where `merchants` has no RLS policy, so `dbUser` (web_anon SELECT grant) is sufficient.
- `tests/rls.e2e.test.ts`: added T9 — `ai_usage_events` cross-tenant deny test. Three pins: tenant A reads only its own rows, A cannot read B's rows under set_config to A, WITH CHECK rejects A inserting a row stamped with B's id. Closes Codex's #6 RLS coverage gap. `aiUsageEvents` schema import + cleanup added to `beforeAll`/`afterAll`.
- `README.md`, `ARCHITECTURE.md` §2 + §4.3, `CLAUDE.md` hard-rule #5: rewrote security claim from "UI code physically cannot bypass tenant isolation" to "3 narrow exceptions with reasons." Added a new "ESLint rule limits to acknowledge" paragraph naming the 4 known bypass routes so V2.6 PR3's blog post can reference it instead of surfacing them as a critique surprise.

---

## V2.6 PR1 — 2026-05-06 (PR #28) — `9d165f3`

**feat(v2.6): wire Vercel Analytics with PII filter**

V2.6 distribution-sprint observability prerequisite for the 90-day sunset gate.

- Added `@vercel/analytics` 2.0.1.
- New `src/lib/observability/analytics-filter.ts`: pure `shouldReportEvent(url)` + `analyticsBeforeSend(event)` adapter. Drops events for `/admin/**`, `/merchant/**`, `/api/**`, `/store/<slug>/order/**`, `/store/<slug>/checkout`, `/merchant/products/import/<uuid>`, and any URL with a UUID-shaped path segment (forgot-future-route protection).
- New `src/components/observability/AnalyticsClient.tsx` — `'use client'` wrapper for `<Analytics beforeSend={...} />`. Required because Next.js App Router refuses to serialize function props from server → client; mounting `<Analytics>` directly in `layout.tsx` fails the build with "Functions cannot be passed directly to Client Components." Caught locally during `pnpm build`.
- `src/app/layout.tsx`: import + mount `<AnalyticsClient />` inside `<body>`.
- `src/app/privacy/page.tsx`: `Last updated 2026-04-29` → `2026-05-06` and added a 1-paragraph Vercel Analytics disclosure under §3 third-party sharing (PDPA hygiene).
- New `tests/observability/analytics-filter.test.ts`: 35 unit tests covering allowed public surfaces, dropped private prefixes, dropped PII URLs (order/checkout/import session UUIDs), edge cases (malformed URLs, prefix-but-no-slash like `/admin-foo`, trailing slashes, the `analyticsBeforeSend` adapter shape).
- Operational artifact: GitHub issue #27 created — `V2.6 sunset gate decision @ 2026-08-06` with criteria body (< 50 unique non-operator visitors AND < 2 inbound contacts → V2.7 = archive).
- T5 cleanup: `tests/rls.e2e.test.ts:T3` second assertion converted from bare `.rejects.toThrow()` to `expectRejectsMatching` per `CLAUDE.md` hard-rule #7. Initial regex `/permission denied|insufficient|cannot|denied|must be superuser/i` failed CI because the test environment doesn't provision a `postgres` role; widened to also match `does not exist|不存在` in a follow-up commit (`6368bae`) to mirror the `SET ROLE web_admin` assertion above.

---

## V2.2.14 — 2026-05-05 (PR #6)

**docs: README live demo badge + STATUS V2.2 entry + CHANGELOG V2.2 entries**

- README.md gets a `[![Live demo](...)](https://demo-sass-2.vercel.app)` badge at the top + storefront example links inline (`/store/akami` and `/store/afen`)
- Tests badge bumped 154 → 260 (it was way out of date)
- STATUS.md gets a full V2.2 section: 14 sub-versions (V2.2.0 → V2.2.14) describing what each shipped + the 4 deploy phases (CI / Neon / R2+Vercel / Inngest+smoke) + 4 post-deploy hotfix PRs, plus a production-data table (1m24s cold-start vs 3m1s pre-region-fix)
- CHANGELOG entries for V2.2.0 → V2.2.13 added below

No code changes; pure docs.

---

## V2.2.13 — 2026-05-05 (PR #5)

**fix(v2.2.13): broken image URLs after R2 storage migration**

V2.2.4 swapped to R2 but JSX kept hardcoded `<img src={`/uploads/${r2Key}`}>`. That path only resolves on local-fs (Next.js public/uploads/). On R2 the actual URL is `${R2_PUBLIC_URL}/${r2Key}`. Every uploaded product showed broken image in production until this fix.

- New `src/lib/storage/public-url-client.ts` `imageUrlFor()` — client-safe (uses `NEXT_PUBLIC_R2_PUBLIC_URL` so Next.js inlines into client bundle), falls back to `/uploads/{key}` when env unset, treats `/fixtures/*` as local-only.
- 4 JSX `<img src>` swapped: `(merchant)/merchant/products/page.tsx` (×2), `(storefront)/store/[slug]/page.tsx`, `(storefront)/store/[slug]/products/[id]/CustomerProductView.tsx`.
- 2 export utilities now use server-side `getPublicUrl` from `@/lib/storage` (Shopee CSV imports need absolute URLs to fetch from outside our domain): `src/lib/export/shopee-csv.ts`, `src/lib/export/products-xlsx.ts`.
- `src/lib/env.ts` adds required `NEXT_PUBLIC_R2_PUBLIC_URL` when `STORAGE_BACKEND=r2` in production.
- Operator action: add `NEXT_PUBLIC_R2_PUBLIC_URL` to Vercel env (Production scope, same value as `R2_PUBLIC_URL`), redeploy.

Test fix: `tests/export/shopee-csv.test.ts` now asserts absolute URL since that's the correct behavior. 260/260 pass.

---

## V2.2.12 — 2026-05-05 (PR #4)

**fix(v2.2.12): bump frontend poll budget 45s → 180s for cold-start tolerance**

Production data after V2.2 deploy:
- iad1 (broken region) cold: 3m 1s
- sin1 cold: 1m 24s
- sin1 warm: ~30s estimated

Frontend was at 45s — every cold-start upload hit fixture fallback even though Inngest worker actually succeeded. User saw fake data instead of their real product.

- `POLL_BUDGET_MS` 45000 → 180000 (3 min covers cold start + sharp libvips first-load + Neon autosuspend wake + Inngest multi-step container init)
- New progressive hints at 30s ("AI 模型正在喚醒") and 90s ("還在跑 — 大型圖片處理 + GPT-4o 解析中") so users know we're working
- Timeout error message updated

---

## V2.2.11 — 2026-05-05 (PR #3)

**fix(v2.2.11): guard against malformed Inngest event payload**

Post-sync introspection delivered an event with empty data, crashed worker with `TypeError: Cannot read properties of undefined (reading 'includes')` from `assertSafeKey(undefined).includes('..')`.

Three layers of guards + 4 tests:
- `product-ingest.ts`: validate `tenantId` / `r2Key` / `merchantId` at handler top, return `{ ok: false, skipped: true, reason: '<missing_field>' }` instead of throwing.
- `r2.ts`: `assertSafeKey` type-narrows via `asserts key is string`, rejects undefined / null / empty / non-string before `.includes()`.
- `local-fs.ts`: same upfront check in `readFile` before `path.join`.

256 → 260 tests.

---

## V2.2 — 2026-05-04/05 (PR #2, squash `58ca815`)

**V2.2 Cloud Hardening Sprint — fix all /autoplan blockers before deploy**

10 commits compressed into one squash merge. Each addresses a finding from the dual-voice /autoplan review (Codex + Claude subagent). 211 → 256 tests.

**Critical fixes (would have broken first deploy)**:
- **C1 — Vision sync timeout**: `/api/products/generate` did sync GPT-4o vision (5-15s) inside the request handler with `maxDuration=60`. Vercel Hobby caps at 10s. Refactored to enqueue Inngest event + return `{ status: 'pending' }` in <1s. Frontend polls `/api/products/generate/status?storageKey=`. Worker writes `aiMetadata.source_key` to correlate result back to upload.
- **C2 — Local filesystem writes**: `local-fs.ts` wrote to `public/uploads/` which is read-only on Vercel. New `src/lib/storage/r2.ts` (R2 backend via `@aws-sdk/client-s3`) + `src/lib/storage/index.ts` facade dispatches by `STORAGE_BACKEND` env. 4 call sites swapped (uploads, generate, ingest worker, image downloader).
- **C3 — Inngest step timing**: 9-step pipeline could exceed 10s per step on Hobby. New `timed()` wrapper in worker emits `[step-timing]` log lines + warns >9000ms. Verification recipe in commit message.
- **C4 — Demo merchant prod backdoor**: `seed-merchant-auth.ts` hardcoded `demo1234` shared password. Added `--mode=prod` (auto when `NODE_ENV=production`) — generates random per-merchant 16-char passwords, sets `suspendedAt=now()` so merchants ship dark until admin approves.

**High fixes**:
- **H1 — pg.Pool storm**: `max=5/3` × N warm lambdas would exhaust Neon. Now `max=1` per pool in production. New `scripts/db/verify-pgbouncer.ts` runs 100 alternating tenant transactions through pooled endpoint, asserts RLS held throughout.
- **H2 — Drizzle migration journal incomplete**: `_journal.json` only tracked 0000-0002. Hand-written 0001a_init_rls + 0003-0008 silently skipped by `drizzle-kit migrate`. New `scripts/db/migrate.ts` reads every `drizzle/migrations/*.sql` in lex order, tracks in `__migrations__` table. Idempotent.
- **H3 — db/init hardcoded passwords**: `01-roles.sql` had literal `web_anon_pass` / `web_admin_pass`. Now marked LOCAL-ONLY + new `prod-roles.template.sql` uses psql variable substitution (`-v web_anon_password=...`).
- **H4 — pg.Pool no SSL config**: Was relying entirely on URL string parsing. Added `ssl: { rejectUnauthorized: true }` explicitly in production. `env.ts` rejects `DATABASE_URL_*` without `sslmode=require` in prod.
- **H5 — Env validation lazy-throws**: Typo'd env name = quiet 500 on first user request, not boot failure. New `src/lib/env.ts` with zod parse + `src/instrumentation.ts` validates at first cold start. Production fail-fasts; dev allows missing optional secrets.
- **H6 — Threat model overstated**: ARCHITECTURE.md §4.4 rewritten to be honest about `web_admin` runtime exposure. Lists what RLS DOES protect (app-logic bugs), what it DOESN'T (compromise), what we have (ESLint allowlist + audit one-liner), what stronger protection would require (separate runtime / stored procedures, deferred).
- **H7 — Test gaps**: New `tests/health/api-health.test.ts` (4 cases) + `tests/products/generate-cap.test.ts` (2 cases).

**V2.2.10 review fixes — second `/autoplan` round on the post-hardening plan caught 5 more**:
- F1: renamed `0001_init_rls.sql` → `0001a_init_rls.sql` (collision with drizzle-gen `0001_*` worked by accident)
- F8: `instrumentation.ts` clarifies it runs at cold start, NOT deploy gate; rollback recipe documented
- F19: `seed-merchant-auth.ts` refuses dev-mode against non-local DB host
- F4: Preview env guard — throws if `VERCEL_ENV=preview && STORAGE_BACKEND=r2`
- F7: ARCHITECTURE.md §4.4 honesty extended to Inngest worker (signing key compromise = arbitrary tenantId writes)
- F10: `GenerationStream.tsx` poll budget 30s → 45s (later bumped to 180s in V2.2.12)

**Phase A — GitHub Actions CI** (`58c2014`, `9ee11a7`):
- `.github/workflows/ci.yml` on every PR + push to main
- Postgres 16 service container with throwaway role passwords via `prod-roles.template.sql`
- `pnpm db:migrate` (V2.2.0 runner) + lint + typecheck + build + 256 vitest
- `pnpm dev` (not `pnpm start`) for HTTP integration tests — keeps env validation lenient on plain TCP localhost
- 3m20s end-to-end
- Operator-only follow-up: GitHub UI branch protection rule on `main` requiring `ci` status check

**Operator-executed Phases B/C/D** documented in [DEPLOY.md](./DEPLOY.md):
- Phase B: Neon Singapore project, 10 migrations applied, 100-iter pgBouncer compat passes
- Phase C: R2 bucket + Account API token, Vercel project import, 17 env vars (Production scope), Function region pinned to sin1
- Phase D: Inngest Cloud app synced, OpenAI $10/mo hard cap, smoke test

Bottom line: Public URL live at https://demo-sass-2.vercel.app. $0/mo at idle. 260 vitest tests + GitHub Actions CI green.

---

## V2.1.2 — 2026-05-04 (`1897aac`)

**fix(v2.1.x): preset dropdown持久顯示 + theme FOUC 消除**

Two follow-up issues from V2.1 walk-through.

- **Issue 1 — preset dropdown 自動 reset 違背直覺**: old `<select defaultValue="">` + onChange 重設 → user 讀「自訂(不套用)」字面意思以為沒套用. Fix: controlled `<select value={appliedPresetId}>`, picked preset stays visible; manually editing any of 5 fields reverts to "自訂". Initial state detects if existing themeVars match a preset (so demo merchants show their preset on first load). Copy updated.
- **Issue 2 — theme FOUC on page nav / refresh**: old client `useEffect` injected themeVars → first paint used default light theme → 1-frame flicker. Fix: server-render inline `<style>:root { --brand-* }</style>` in `(merchant)/layout.tsx` + `ThemeForStore.tsx`. `ThemeForStore.tsx` rewritten as server component (no `'use client'`). `ThemeProvider`'s `useEffect` stays as fallback for client-side state churn (preset dropdown apply).

Tests: unchanged (211). tsc + lint clean.

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
