# Local Setup

Dev onboarding for someone (or future-you) cloning `demo-sass-2`. For project-level context first, read [README.md](./README.md). For architecture depth: [ARCHITECTURE.md](./ARCHITECTURE.md). For version history: [STATUS.md](./STATUS.md) and [CHANGELOG.md](./CHANGELOG.md).

---

## TL;DR — five commands

```bash
docker compose up -d                                        # 1. Postgres + roles
cp .env.local.example .env.local                            # 2. Env (defaults work)
bun install                                                 # 3. Deps
bun run db:push                                             # 4. Migrate (0000..0007)
bun run dev                                                 # 5. http://localhost:3000
```

If you want AI features (photo upload, IG/蝦皮 import) end-to-end, you also need:

```bash
# Add OPENAI_API_KEY to .env.local, then:
bunx inngest-cli dev -u http://localhost:3000/api/inngest   # second terminal
```

---

## Prerequisites

- **Node 20+** (for Next.js 15 / React 19)
- **Bun** (preferred) — `curl -fsSL https://bun.sh/install | bash`. `pnpm` and `npm` work but the scripts assume `bun` for speed.
- **Docker Desktop** (for the Postgres 16 container)
- **OpenAI API key** — only required if you want to test AI photo → listing or batch import. Without it, the rest of the app runs.
- **Inngest dev CLI** — only required for batch import (`/merchant/products/import`). Auto-fetched by `bunx`.

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
# demo-sass-2-postgres    healthy

docker exec -it demo-sass-2-postgres psql -U owner -d demo_sass_2 \
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
bun install
bun run db:push
```

`db:push` runs `drizzle-kit push`, which applies the schema in `src/db/schema.ts`. To apply individual migrations instead (useful when bisecting):

```bash
docker exec -i demo-sass-2-postgres psql -U owner -d demo_sass_2 \
  < drizzle/migrations/0000_moaning_mimic.sql
# ...repeat for 0001..0007
```

Each migration has a paired `*.rollback.sql`. To roll back V1.7's onboarding hardening for example:

```bash
docker exec -i demo-sass-2-postgres psql -U owner -d demo_sass_2 \
  < drizzle/migrations/0007_v17_onboarding_hardening.rollback.sql
```

### 4. Seed two demo merchants

```bash
docker exec -i demo-sass-2-postgres psql -U owner -d demo_sass_2 <<'EOF'
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
bun run dev
```

http://localhost:3000.

For AI batch import, run the Inngest dev CLI in a second terminal:

```bash
bunx inngest-cli dev -u http://localhost:3000/api/inngest
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
bunx vitest run                                     # full suite (154 tests)
bunx vitest run tests/rls.e2e.test.ts               # one file
bunx vitest run tests/ai/cost-cap.test.ts           # AI cost cap
bunx vitest run --reporter=verbose                  # see each test name
bun run test:rls                                    # alias for the RLS suite
bunx tsc --noEmit                                   # type check
bun run lint                                        # ESLint (incl. dbAdmin allowlist)
```

Tests connect to the same Docker Postgres. RLS suite runs as `web_anon`; everything else uses `dbAdmin` for fixture setup speed and uses UUID prefix `99999999-...` for cleanup namespacing.

Manual smoke: `tests/v1-smoke.md` (25 steps, 10–15 minutes).

---

## Common gotchas

### `/store/akami` returns 404

Slug cache stuck on a stale negative result. Fix:

```bash
rm -rf .next
bun run dev
```

The `(merchant)/settings` action calls `invalidateSlug()` on slug change — this avoids the issue in production. See `src/lib/tenant/resolver.ts`.

### RLS test wipes demo merchants

Older test fixtures used the same UUID range as the seed. Fixed: tests now use `99999999-...`-prefixed UUIDs and `afterAll` only cleans its prefix. If you hit it on an old branch, re-seed using Step 4.

### Cost chip stuck at NT$0 after a real photo upload

V1.5 bug — fixed in `13a9957`. Verify migration `0006_ai_usage_events.sql` was applied:

```bash
docker exec -it demo-sass-2-postgres psql -U owner -d demo_sass_2 \
  -c "\d ai_usage_events"
```

### Inngest dev CLI can't reach the app

Default URL is `http://localhost:3000/api/inngest`. If `bun run dev` ended up on port 3001 (3000 occupied), point the CLI explicitly:

```bash
bunx inngest-cli dev -u http://localhost:3001/api/inngest
```

### `OPENAI_API_KEY` missing → 503 on AI routes

Expected. The product-listing UI and batch import return 503 until the key is set. The rest of the app (storefronts, admin, orders, manual product CRUD) runs fine.

### Storefront for a freshly-onboarded merchant shows 「暫停營業中」

V1.7 added `approved_at` — new signups are suspended-by-default until admin approves. Hit `/admin/merchants/{id}` and click 「核可商家」, or set `approved_at` directly:

```sql
UPDATE merchants SET approved_at = NOW(), approved_by_admin = 'system' WHERE slug = '<slug>';
```

### `dbAdmin` import error in lint

ESLint blocks `dbAdmin` outside the allowlist in `eslint.config.mjs`. If you genuinely need cross-tenant access (rare — almost always you want `withTenantTx` + `dbUser`), add the file path to the allowlist with a one-line justification.

---

## Resetting

```bash
docker compose down -v   # destroy volume — full reset
docker compose up -d
bun run db:push          # re-migrate
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
| `eslint.config.mjs` | `dbAdmin` allowlist — extend carefully |
| `drizzle/migrations/` | Forward + rollback SQL, one pair per version |
| `tests/v1-smoke.md` | 25-step manual QA checklist |

---

## v2 cloud deploy

When switching to Neon + R2 + Vercel:

| Service | Where it changes |
|---|---|
| **Neon** | `src/db/index.ts` — swap to `drizzle-orm/neon-serverless` driver. `.env` — Neon connection strings. **Important**: Neon roles need `CREATE ROLE web_anon WITH LOGIN PASSWORD '...'` + `CREATE ROLE web_admin WITH LOGIN PASSWORD '...' BYPASSRLS` re-applied via SQL editor (`docker compose` ran `01-roles.sql` automatically; Neon does not). |
| **R2** | `src/lib/storage/` — promote the `.legacy` R2 client. Server actions switch to presigned URL flow. `useFileUpload` direct-uploads to R2. |
| **Vercel** | `bunx vercel --prod` after pulling `.env.local` to Vercel env. |
| **Inngest** | Add `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` from app.inngest.com. The `/api/inngest` route is already serverless-ready. |

V1.7 `approved_at` flow + reserved-slug list + IP rate limit work the same in production. Inngest worker logs map cleanly to the prod dashboard.
