# Local Setup

Dev onboarding for someone (or future-you) cloning `rls-ai-shop`. For project-level context first, read [README.md](./README.md). For architecture depth: [ARCHITECTURE.md](./ARCHITECTURE.md). For version history: [STATUS.md](./STATUS.md) and [CHANGELOG.md](./CHANGELOG.md).

---

## TL;DR — five commands

```bash
docker compose up -d                                        # 1. Postgres + roles
cp .env.local.example .env.local                            # 2. Env (defaults work)
pnpm install                                                # 3. Deps
pnpm db:migrate                                             # 4. Apply all SQL migrations
pnpm dev                                                    # 5. http://localhost:3000
```

If you want AI features (photo upload, IG/蝦皮 import) end-to-end, you also need:

```bash
# Add OPENAI_API_KEY to .env.local, then:
pnpm inngest:dev   # second terminal
```

---

## Prerequisites

- **Node 22+** (for Next.js 15 / React 19, matches `engines.node` in package.json)
- **pnpm 9+** — install via `corepack enable` (uses the `packageManager` pin). `bun` / `npm` / `yarn` are blocked by an `only-allow` preinstall.
- **Docker Desktop** (for the Postgres 16 container)
- **OpenAI API key** — only required if you want to test AI photo → listing or batch import. Without it, the rest of the app runs.
- **Inngest dev CLI** — only required for batch import (`/merchant/products/import`). Run `pnpm inngest:dev` (auto-fetched on first use).

---

## Step-by-step

### 1. Boot Postgres + roles

```bash
docker compose up -d
```

This starts Postgres 16 on `localhost:5432` and runs `db/init/01-roles.sql` automatically (creates `web_anon` and `web_admin` roles with the passwords baked into `.env.local.example`).

Verify:

```bash
docker compose ps
# rls-ai-shop-postgres    healthy

docker exec -it rls-ai-shop-postgres psql -U owner -d rls_ai_shop \
  -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('web_anon','web_admin');"
# web_anon  | f
# web_admin | t
```

`BYPASSRLS = t` on `web_admin` is non-negotiable — Postgres role inheritance does NOT propagate this attribute, so it must be set on the LOGIN role directly.

### 2. Environment variables

```bash
cp .env.local.example .env.local
```

| Var | Required | What it's for |
|---|---|---|
| `DATABASE_URL` | yes | Owner connection — used by `drizzle-kit` for migrations |
| `DATABASE_URL_USER` | yes | `web_anon` connection — RLS-enforced, all user-facing reads/writes |
| `DATABASE_URL_ADMIN` | yes | `web_admin` connection — `BYPASSRLS`, only allowed paths in `eslint.config.mjs` |
| `NEXT_PUBLIC_APP_URL` | yes | Used by GPT-4o vision calls to build presigned image URLs |
| `OPENAI_API_KEY` | for AI | Photo upload + IG/蝦皮 import. Without it those routes 503; rest of the app runs |
| `INNGEST_EVENT_KEY` | dev: no | Empty in local dev (the dev CLI handles auth). Required for prod deploy |
| `INNGEST_SIGNING_KEY` | dev: no | Same as above |
| `DEMO_MERCHANT_AKAMI_ID` | yes | UUID for the `akami` seed merchant |
| `DEMO_MERCHANT_AFEN_ID` | yes | UUID for the `afen` seed merchant |
| `ADMIN_PASSWORD` | yes | Password for `/admin/login`. **Change from `changeme`** before sharing |
| `ADMIN_SESSION_SECRET` | yes | HMAC secret. Generate with `openssl rand -hex 32`. Must be ≥32 chars |

Defaults in `.env.local.example` align with the Docker container — no edits needed for local dev unless you want AI.

### 3. Install + migrate

```bash
pnpm install
pnpm db:migrate
```

`db:migrate` runs the custom SQL migration runner at `scripts/db/migrate.ts`. It reads every `drizzle/migrations/*.sql` (excluding `.rollback.sql`), tracks applied filenames in a `__migrations__` table, and runs each unapplied file in its own transaction.

V2.2.0 reason for the custom runner: drizzle-kit's `migrate` only walks its own `_journal.json`, which only tracked 0000-0002. Hand-written RLS / feature migrations (`0001a_init_rls`, `0003-0008`) were never journaled and were applied historically via manual `psql` or `db:push`. This runner fixes that — `pnpm db:migrate` now applies everything in lexical order, idempotent. (V2.2.10 renamed `0001_init_rls.sql` → `0001a_init_rls.sql` to disambiguate from drizzle-generated `0001_confused_stone_men.sql`.)

```bash
pnpm db:migrate:status           # show which migrations are applied / pending
pnpm db:migrate:bootstrap        # mark all current files as applied without running them
                                  # (use this once if you have an existing local DB built via db:push)
```

`db:push` (drizzle-kit push) is still available for quick schema iteration during dev but does NOT apply RLS / hand-written migrations. Production deploys must use `db:migrate`.

Each migration has a paired `*.rollback.sql`. To roll back V1.7's onboarding hardening for example:

```bash
docker exec -i rls-ai-shop-postgres psql -U owner -d rls_ai_shop \
  < drizzle/migrations/0007_v17_onboarding_hardening.rollback.sql
# Then manually remove the row from __migrations__:
docker exec -i rls-ai-shop-postgres psql -U owner -d rls_ai_shop \
  -c "DELETE FROM __migrations__ WHERE filename = '0007_v17_onboarding_hardening.sql'"
```

### 4. Seed two demo merchants

```bash
docker exec -i rls-ai-shop-postgres psql -U owner -d rls_ai_shop <<'EOF'
INSERT INTO merchants (id, slug, name, brand_voice, theme_vars, approved_at, approved_by_admin) VALUES
  ('11111111-1111-1111-1111-111111111111',
   'akami',
   '阿明選物',
   '日式侘寂選物，質感溫潤，文字偏內斂。',
   '{"--brand-primary":"#8B7355","--brand-bg":"#FAF8F5","--brand-text":"#2C2416","--brand-radius":"2px","--brand-font-heading":"Noto Serif TC,serif"}'::jsonb,
   NOW(), 'system'),
  ('22222222-2222-2222-2222-222222222222',
   'afen',
   '阿芬鹹酥雞',
   '夜市熱賣親切庶民，文字活潑，敢用台語。',
   '{"--brand-primary":"#E63946","--brand-bg":"#FFF8E7","--brand-text":"#1D3557","--brand-radius":"12px","--brand-font-heading":"Noto Sans TC,sans-serif"}'::jsonb,
   NOW(), 'system')
ON CONFLICT (id) DO NOTHING;
EOF
```

Note: V1.7 added `approved_at` — pre-existing merchants need it set or storefronts will show 「暫停營業中」.

### 5. Run

```bash
pnpm dev
```

http://localhost:3000.

For AI batch import, run the Inngest dev CLI in a second terminal:

```bash
pnpm inngest:dev
# Inngest UI at http://localhost:8288
```

---

## URL reference

| URL | Use |
|---|---|
| http://localhost:3000 | Marketplace home (lists approved merchants) |
| http://localhost:3000/store/akami | Storefront for 阿明選物 |
| http://localhost:3000/store/afen | Storefront for 阿芬鹹酥雞 |
| http://localhost:3000/merchant | Merchant dashboard (KPIs + inbox) |
| http://localhost:3000/merchant/products | Product list (CRUD + AI generate + import) |
| http://localhost:3000/merchant/products/new | Single-photo AI generation |
| http://localhost:3000/merchant/orders | Order list + status flow |
| http://localhost:3000/merchant/settings | Brand vars + low-stock threshold + daily AI cap |
| http://localhost:3000/merchant-switcher | V1.7 full-list switcher (search + paginate) |
| http://localhost:3000/admin/login | Admin password gate |
| http://localhost:3000/admin | Admin overview + merchant ranking |
| http://localhost:3000/admin/queue | Cross-merchant operator queue (P1–P5) |
| http://localhost:3000/admin/cost | Platform AI cost dashboard (14-day, anomaly) |
| http://localhost:3000/admin/merchants/{id} | Merchant detail + approve / suspend / rename |
| http://localhost:3000/onboarding | Public signup (rate-limited, honeypot, reserved-slug guard) |
| http://localhost:8288 | Inngest dev UI (job runs / logs) |

Switching merchant: top-right MerchantSwitcher (V1.7 — top 10 + inline search; full list at `/merchant-switcher`).

---

## Admin login

```
URL:      http://localhost:3000/admin/login
Password: <whatever you set in ADMIN_PASSWORD>
```

The default in `.env.local.example` is `changeme`. The session cookie is HMAC-signed with `ADMIN_SESSION_SECRET` and TTL'd 24h. To revoke a session:

```sql
DELETE FROM admin_sessions WHERE id = '<session_uuid>';
```

The `(admin)` layout calls `validateAdminSession()` against the DB on every render (V1.6 E11 fix), so revoked sessions stop working immediately on the next request — not just on cookie expiry.

---

## Tests

```bash
pnpm vitest run                                     # full suite (260+ tests)
pnpm vitest run tests/rls.e2e.test.ts               # one file
pnpm vitest run tests/ai/cost-cap.test.ts           # AI cost cap
pnpm vitest run --reporter=verbose                  # see each test name
pnpm test:rls                                       # alias for the RLS suite
pnpm typecheck                                      # type check
pnpm lint                                           # ESLint (incl. dbAdmin + dbUser allowlist)
pnpm lint:docs                                      # README drift check (V2.3.6)
```

Tests connect to the same Docker Postgres. RLS suite runs as `web_anon`; everything else uses `dbAdmin` for fixture setup speed and uses UUID prefix `99999999-...` for cleanup namespacing.

Manual smoke: `tests/v1-smoke.md` (25 steps, 10–15 minutes).

**AI vision automated smoke** (V2.6.2 — replaces the 7-step manual checklist):

```bash
# Terminal 1: pnpm dev
# Terminal 2: pnpm inngest:dev
# Terminal 3:
pnpm test:smoke:ai-local   # ~90s wall, ~$0.02 OpenAI tokens
```

Preflight-checks env + DB + dev server + Inngest CLI all reachable, then logs in as `akami@demo.local` (password `demo1234` after `pnpm tsx scripts/seed-merchant-auth.ts --mode=dev`), uploads `tests/fixtures/smoke-product.jpg`, polls for the AI-generated product, asserts the title is NOT a fixture-fallback string, and queries `ai_usage_events` directly to confirm `tokens_in > 0` (load-bearing — catches silent token-shape zeroing across SDK majors). Cleans up the test product on success. **Don't run in CI** — `*-local.smoke.ts` is excluded from the post-deploy chromium project.

If you don't have local Docker/Inngest running, V2.6.x Tier 1 #7 ships a `workflow_dispatch` GH Action mirror: `gh workflow run "AI vision smoke (manual)"` (requires `OPENAI_API_KEY_SMOKE` repo secret).

---

## Common gotchas

### `/store/akami` returns 404

Slug cache stuck on a stale negative result. Fix:

```bash
rm -rf .next
pnpm dev
```

The `(merchant)/settings` action calls `invalidateSlug()` on slug change — this avoids the issue in production. See `src/lib/tenant/resolver.ts`.

### RLS test wipes demo merchants

Older test fixtures used the same UUID range as the seed. Fixed: tests now use `99999999-...`-prefixed UUIDs and `afterAll` only cleans its prefix. If you hit it on an old branch, re-seed using Step 4.

### Cost chip stuck at NT$0 after a real photo upload

V1.5 bug — fixed in `13a9957`. Verify migration `0006_ai_usage_events.sql` was applied:

```bash
docker exec -it rls-ai-shop-postgres psql -U owner -d rls_ai_shop \
  -c "\d ai_usage_events"
```

### Inngest dev CLI can't reach the app

Default URL is `http://localhost:3000/api/inngest`. If `pnpm dev` ended up on port 3001 (3000 occupied), point the CLI explicitly:

```bash
pnpm exec inngest-cli dev -u http://localhost:3001/api/inngest
```

### `OPENAI_API_KEY` missing → 503 on AI routes

Expected. The product-listing UI and batch import return 503 until the key is set. The rest of the app (storefronts, admin, orders, manual product CRUD) runs fine.

### Storefront for a freshly-onboarded merchant shows 「暫停營業中」

V1.7 added `approved_at` — new signups are suspended-by-default until admin approves. Hit `/admin/merchants/{id}` and click 「核可商家」, or set `approved_at` directly:

```sql
UPDATE merchants SET approved_at = NOW(), approved_by_admin = 'system' WHERE slug = '<slug>';
```

### `dbAdmin` / `dbUser` import error in lint

ESLint blocks both `dbAdmin` AND `dbUser` outside the allowlist in `eslint.config.mjs` (V2.6.x Tier 1 #4 added `dbUser` because direct use skips the RLS GUC and fail-closes to 0 rows). For tenant-scoped reads/writes, import `withTenantTx` from `@/lib/db/with-tenant` instead — the wrapper is dbUser-backed and sets the GUC inside a transaction. If you genuinely need cross-tenant `dbAdmin` access (rare), add the file path to the allowlist with a one-line justification.

---

## Resetting

```bash
docker compose down -v   # destroy volume — full reset
docker compose up -d
pnpm db:migrate          # re-apply all migrations
# then re-seed (Step 4)
```

---

## Useful files

| File | Why |
|---|---|
| `src/db/schema.ts` | Drizzle schema — single source of truth for the data model |
| `src/lib/db/with-tenant.ts` | RLS context helper — every tenant write goes through this |
| `src/lib/import/url-guard.ts` | SSRF defense — every external fetch goes through this |
| `src/lib/observability/ai-cost.ts` | AI cost cap gate (`assertWithinDailyCap`) |
| `src/lib/observability/ai-cost-pricing.ts` | USD→TWD rate + GPT-4o pricing constants (sole source) |
| `src/lib/admin-session.ts` + `admin-session-edge.ts` | Admin session helpers — split for Edge runtime |
| `src/lib/admin/operator-queue.ts` | Cross-merchant operator queue compound CTE |
| `eslint.config.mjs` | `dbAdmin` + `dbUser` allowlist — extend carefully |
| `drizzle/migrations/` | Forward + rollback SQL, one pair per version |
| `tests/v1-smoke.md` | 25-step manual QA checklist |

---

## v2 cloud deploy

When switching to Neon + R2 + Vercel:

| Service | Where it changes |
|---|---|
| **Neon** | `src/db/index.ts` — swap to `drizzle-orm/neon-serverless` driver. `.env` — Neon connection strings. **Important**: Neon roles need `CREATE ROLE web_anon WITH LOGIN PASSWORD '...'` + `CREATE ROLE web_admin WITH LOGIN PASSWORD '...' BYPASSRLS` re-applied via SQL editor (`docker compose` ran `01-roles.sql` automatically; Neon does not). |
| **R2** | `src/lib/storage/` — promote the `.legacy` R2 client. Server actions switch to presigned URL flow. `useFileUpload` direct-uploads to R2. |
| **Vercel** | `pnpm dlx vercel --prod` after pulling `.env.local` to Vercel env. (V2.2 cloud deploy is the canonical path — see [DEPLOY.md](./DEPLOY.md).) |
| **Inngest** | Add `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` from app.inngest.com. The `/api/inngest` route is already serverless-ready. |

V1.7 `approved_at` flow + reserved-slug list + IP rate limit work the same in production. Inngest worker logs map cleanly to the prod dashboard.
