# Deploy Runbook — V2.2 Cloud (Vercel + Neon + R2 + Inngest)

Step-by-step recipe for shipping `rls-ai-shop` from local-only to a public URL.
Companion to [README.md](./README.md), [LOCAL_SETUP.md](./LOCAL_SETUP.md), and
[ARCHITECTURE.md](./ARCHITECTURE.md).

**Target stack:**
- Compute: **Vercel Hobby** (free)
- DB: **Neon Postgres** Singapore (free tier)
- Storage: **Cloudflare R2** (free tier)
- Background jobs: **Inngest Cloud** (free tier)
- AI: **OpenAI** (pay-as-you-go, capped at $10/mo via dashboard)

**Total cost at idle:** $0/mo. **Hard cap on worst case:** ~$10/mo (OpenAI only).

**Prereqs:**
- PR #2 (V2.2 hardening) merged to `main`
- GitHub branch protection on `main` enabled (requires CI green)
- Working accounts: GitHub, Vercel, Neon, Cloudflare, Inngest, OpenAI

**Secrets you'll generate during this runbook — save them all in 1Password / age-encrypted file as you go:**
- Neon `web_anon_password` (random base64, 24 chars)
- Neon `web_admin_password` (random base64, 24 chars)
- Vercel `ADMIN_PASSWORD` (random hex, 16 chars)
- Vercel `ADMIN_SESSION_SECRET` (random hex, 32 chars)
- Vercel `MERCHANT_SESSION_SECRET` (random hex, 32 chars, different from admin)
- R2 access key + secret
- Inngest event key + signing key
- Per-merchant random passwords (printed by `seed-merchant-auth.ts --mode=prod`)

---

## Phase B: Neon Provisioning (~30 min, mostly clicks)

### B.1 — Create the Neon project

1. Go to https://console.neon.tech → "New Project"
2. Project name: `rls-ai-shop`
3. Region: **Asia Pacific (Singapore)** — colocated with our chosen Vercel region
4. Postgres version: 16 (or latest)
5. Database name: `demo_sass_2`
6. Click **Create**

**Capture:**
- Connection string (Neon shows it after create). Has shape:
  ```
  postgresql://<owner>:<password>@<host>.neon.tech/demo_sass_2?sslmode=require
  ```
  Save as `NEON_OWNER_URL_UNPOOLED`.
- Build the **pooled** URL by adding `-pooler` to the host:
  ```
  postgresql://<owner>:<password>@<host>-pooler.neon.tech/demo_sass_2?sslmode=require
  ```
  Save as `NEON_OWNER_URL_POOLED`.

### B.2 — Bootstrap the RLS roles

Generates fresh passwords for `web_anon` and `web_admin`, saves them, and creates the roles in Neon via the V2.2.3 template.

```bash
# In a terminal with psql installed:
ANON_PW=$(openssl rand -base64 24)
ADMIN_PW=$(openssl rand -base64 24)

# WRITE THESE DOWN NOW — printed once, no recovery
echo "web_anon_password=$ANON_PW"
echo "web_admin_password=$ADMIN_PW"

# Apply the template (V2.2.3 + V2.2.10 \gexec fix)
psql "$NEON_OWNER_URL_UNPOOLED" \
  --set ON_ERROR_STOP=on \
  -v "web_anon_password=$ANON_PW" \
  -v "web_admin_password=$ADMIN_PW" \
  -f db/init/prod-roles.template.sql
```

**Expect output:**
```
 rolname  | rolcanlogin | rolbypassrls
----------+-------------+--------------
 web_admin | t          | t
 web_anon  | t          | f
(2 rows)
```

If `web_admin.rolbypassrls` is **not** `t`, stop. Cross-tenant aggregation in `/admin/*` won't work.

### B.3 — Apply migrations

```bash
DATABASE_URL=$NEON_OWNER_URL_UNPOOLED pnpm db:migrate
```

**Expect:**
```
Found 10 pending migration(s):
  - 0000_moaning_mimic.sql
  - 0001_confused_stone_men.sql
  - 0001a_init_rls.sql
  - 0002_low_wonder_man.sql
  - 0003_v1_rls.sql
  - 0004_v15_provider_col.sql
  - 0005_revert_provider_col.sql
  - 0006_ai_usage_events.sql
  - 0007_v17_onboarding_hardening.sql
  - 0008_v2_merchant_auth.sql

Applying 0000_moaning_mimic.sql... ✓
... (10 ✓ marks)
Done. Applied 10 migration(s).
```

> **Why the unpooled URL?** Migrations contain DDL + RLS policies. pgBouncer transaction mode handles this correctly today, but session-mode (unpooled) is the safer default — no compromise on correctness, slightly slower. Migrations are infrequent.

### B.4 — Build the per-role pooled URLs

```bash
# These are the URLs Vercel will use at runtime.
# Substitute <host> with the part before .neon.tech in your owner URL.
DATABASE_URL_USER="postgresql://web_anon:$ANON_PW@<host>-pooler.<region>.aws.neon.tech/demo_sass_2?sslmode=require"
DATABASE_URL_ADMIN="postgresql://web_admin:$ADMIN_PW@<host>-pooler.<region>.aws.neon.tech/demo_sass_2?sslmode=require"

echo "DATABASE_URL_USER=$DATABASE_URL_USER"
echo "DATABASE_URL_ADMIN=$DATABASE_URL_ADMIN"
```

> **Pooled (`-pooler` suffix)** for runtime. Each Vercel cold container opens its own pool with `max=1` (V2.2.1), and pgBouncer multiplexes those connections to a smaller backend pool — keeps Neon's connection budget honest.

### B.5 — Verify pgBouncer compat

This is the V2.2.6 verifier. Confirms RLS via `withTenantTx` still enforces tenant isolation through pgBouncer transaction mode.

```bash
DATABASE_URL_USER="$DATABASE_URL_USER" \
DATABASE_URL_ADMIN="$DATABASE_URL_ADMIN" \
  pnpm tsx scripts/db/verify-pgbouncer.ts
```

**Expect:**
```
Setting up two test tenants...
Running 100 alternating transactions through the pooler...
OK: 100 transactions, RLS held throughout.
pgBouncer transaction-mode compat confirmed for withTenantTx.
OK: dbUser without app.tenant_id sees 0 rows (RLS denies all).
Cleaning up test data...
```

If any "FAIL: ... leaks observed" — **stop**. Don't deploy. Open an issue.

### B.6 — Seed demo merchants in prod mode

V2.2.2 prod mode generates a unique random password per merchant and ships them all in **suspended** state. They won't be visible on the storefront until you admin-approve them post-deploy.

```bash
NODE_ENV=production \
DATABASE_URL_USER="$DATABASE_URL_USER" \
DATABASE_URL_ADMIN="$DATABASE_URL_ADMIN" \
  pnpm tsx scripts/seed-merchant-auth.ts > /tmp/merchant-creds.txt
```

> V2.2.10's safety guard refuses to run with default `dev` mode against any non-localhost DB host, so even if you forget `NODE_ENV=production` it won't seed `demo1234` into prod.

**Capture the credentials:**
```bash
chmod 600 /tmp/merchant-creds.txt
cat /tmp/merchant-creds.txt
# Copy the table into 1Password / age-encrypted file. The passwords are NOT
# recoverable later — this is your only chance.
```

The output looks like:
```
| slug    | email              | password         |
|---------|--------------------|------------------|
| akami   | akami@demo.local   | aB3xK7-pQwz9nR1m |
| afen    | afen@demo.local    | xY8nQ2_kJrT5pVfH |
```

After saving:
```bash
shred -u /tmp/merchant-creds.txt   # macOS: rm -P /tmp/merchant-creds.txt
```

---

## Phase C: R2 + Vercel Project Setup (~45 min, mostly clicks)

### C.1 — Cloudflare R2 bucket

1. https://dash.cloudflare.com → **R2 Object Storage** → "Create bucket"
2. Name: `rls-ai-shop-prod` (must be globally unique within your account)
3. Location hint: **Asia-Pacific** (closest to Vercel sin1)
4. Click **Create bucket**

5. Open the bucket → **Settings** → **Public access** → enable "Allow access via R2.dev subdomain". Capture the public URL (looks like `https://pub-<hash>.r2.dev`).

6. Top-right user menu → **API Tokens** → "Create Account API Token":
   - Token name: `rls-ai-shop-prod`
   - Permissions: **Object Read & Write**
   - Specify bucket: `rls-ai-shop-prod` (NOT all buckets)
   - TTL: leave default
   - Click **Create**

**Capture:**
- `R2_ENDPOINT`: `https://<account_id>.r2.cloudflarestorage.com` (shown after token create)
- `R2_ACCESS_KEY_ID`: shown once
- `R2_SECRET_ACCESS_KEY`: shown once
- `R2_BUCKET`: `rls-ai-shop-prod`
- `R2_PUBLIC_URL`: `https://pub-<hash>.r2.dev` (from step 5)

### C.2 — Vercel project import

1. https://vercel.com/new → "Import Git Repository" → pick `vincent97277/ai-powered-e-commerce-listing`
2. **Configure Project:**
   - Framework preset: Next.js (auto-detected)
   - Root directory: `./`
   - Build command: `pnpm build` (default)
   - Install command: `pnpm install --frozen-lockfile`
   - Output directory: leave default
3. **DON'T deploy yet** — click "Environment Variables" first.

### C.3 — Vercel environment variables (Production scope)

For each variable below, click "Add" → set Name + Value → **scope to Production only** (uncheck Preview and Development).

```
DATABASE_URL_USER          = <DATABASE_URL_USER from B.4>
DATABASE_URL_ADMIN         = <DATABASE_URL_ADMIN from B.4>
NEXT_PUBLIC_APP_URL        = https://demo-sass-2.vercel.app  (update after C.5 if custom domain)
ADMIN_PASSWORD             = $(openssl rand -hex 16)
ADMIN_SESSION_SECRET       = $(openssl rand -hex 32)
MERCHANT_SESSION_SECRET    = $(openssl rand -hex 32)        ← MUST differ from ADMIN_SESSION_SECRET
DEMO_MERCHANT_AKAMI_ID     = 11111111-1111-1111-1111-111111111111
DEMO_MERCHANT_AFEN_ID      = 22222222-2222-2222-2222-222222222222
OPENAI_API_KEY             = sk-...                          (fresh prod key from platform.openai.com)
STORAGE_BACKEND            = r2
R2_ENDPOINT                = <from C.1>
R2_ACCESS_KEY_ID           = <from C.1>
R2_SECRET_ACCESS_KEY       = <from C.1>
R2_BUCKET                  = rls-ai-shop-prod
R2_PUBLIC_URL              = <from C.1>
```

`INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` come in Phase D; Vercel will redeploy when they're added.

### C.4 — Vercel Preview/Dev env (separate Neon branch)

**CRITICAL** — preview deploys must NOT touch production data.

1. https://console.neon.tech → your project → "Branches" → "Create branch"
2. Name: `preview`. Created from `main` instantly (Neon copy-on-write).
3. Capture preview URLs: `<host>-pooler.<region>...` for both `web_anon` and `web_admin` against the preview branch.

In Vercel:
4. Go back to Environment Variables.
5. For **DATABASE_URL_USER** and **DATABASE_URL_ADMIN**, click "Edit" → add scope **Preview** with the Neon `preview` branch URLs (different from Production scope).
6. For **STORAGE_BACKEND**, add a Preview-scoped value of `local` so PR previews use the ephemeral filesystem (won't persist, but won't pollute prod R2 either).
7. **DO NOT** add `R2_*` vars to the Preview scope. V2.2.10's instrumentation guard will throw at boot if Preview ever sees `STORAGE_BACKEND=r2`, but defense-in-depth: just don't supply the credentials.

### C.5 — Vercel project settings — region

1. Project → Settings → Functions
2. Region: pick **Singapore (sin1)**
3. Click Save

This colocates serverless functions with the Neon Singapore database. Without this, every DB query is a transcontinental round-trip (200-300ms). With it, ~5ms.

### C.6 — First deploy

1. Vercel project → Deployments → click **Deploy** on the latest commit
2. Watch the build. Expect:
   - "Installing dependencies" — pnpm install
   - "Building" — `pnpm build`
   - "Deployment ready" with the URL

3. Open the URL. The storefront should render at `/`. Both `/store/akami` and `/store/afen` will show "暫停營業中" (suspended) — that's correct, prod-mode seed marked them suspended.

**If deploy fails:** check Vercel logs. Most common:
- `Invalid environment configuration: ...` → re-check env vars from C.3, especially the Production scope toggle
- `INNGEST_EVENT_KEY: Required` → expected, will resolve in Phase D when you add Inngest keys

> The instrumentation hook now logs `[env] validated successfully` on every cold start. You can grep `vercel logs` to confirm.

---

## Phase D: Inngest Cloud + Smoke Test + Caps (~45 min)

### D.1 — Inngest Cloud project

1. https://app.inngest.com → "New App"
2. App name: `rls-ai-shop`
3. Plan: Hobby (free)
4. Click **Create**

5. Settings → Keys → capture both:
   - **Event Key** (for `inngest.send` from the route)
   - **Signing Key** (for the `/api/inngest` webhook to verify Inngest's calls)

### D.2 — Add Inngest keys to Vercel

1. Vercel project → Settings → Environment Variables (Production scope only)
2. Add:
   ```
   INNGEST_EVENT_KEY    = <Event Key from D.1>
   INNGEST_SIGNING_KEY  = <Signing Key from D.1>
   ```
3. Vercel will prompt to redeploy. Click "Redeploy" on the latest deployment.

### D.3 — Connect Inngest to your URL

1. https://app.inngest.com → your `rls-ai-shop` app → "Apps" tab → "Sync new app"
2. SDK URL: `https://demo-sass-2.vercel.app/api/inngest` (replace with your real Vercel URL)
3. Click **Sync**. Inngest discovers the function and shows "Product Ingest Pipeline" registered.

> If sync fails: check the URL is reachable from outside (hit it in a browser, expect a JSON response from the Inngest SDK), and confirm `INNGEST_SIGNING_KEY` matches.

### D.4 — OpenAI hard cap

1. https://platform.openai.com → Settings → **Limits**
2. **Monthly budget** → set to `$10`
3. **Email notification threshold** → `$5`
4. Click Save

This is the vendor-side hard stop. The app's own daily NT$ cap (`assertWithinDailyCap`) is defense-in-depth — both fire independently.

### D.5 — Vercel hobby spending guard

1. Vercel project → Settings → Billing
2. Confirm: **No payment method on file**

Vercel Hobby is free, but having a card on file means overages can bill. No card = automatic hard cap (Vercel pauses the project at limit, doesn't bill).

### D.6 — Smoke test (manual checklist)

Open the deployed URL in a browser. Each line below must work before declaring done.

| # | Action | Expected |
|---|---|---|
| 1 | GET `/` | Storefront landing renders, no console errors |
| 2 | GET `/store/akami` | "暫停營業中" page (merchants seed suspended) |
| 3 | GET `/store/afen` | "暫停營業中" page |
| 4 | GET `/admin/login` | Login form |
| 5 | Submit admin login with `ADMIN_PASSWORD` from C.3 | Redirects to `/admin` dashboard |
| 6 | Click on a merchant in `/admin` → un-suspend (set approved if needed) | Banner clears |
| 7 | GET `/store/akami` again | Storefront opens, shows merchant theme |
| 8 | GET `/merchant/login` | Login form |
| 9 | Submit `akami@demo.local` + the random password from B.6 | Redirects to `/merchant` dashboard |
| 10 | Upload a product photo via `/merchant/products/new` | Upload succeeds, then "AI 生成中" with rotating reassurance copy |
| 11 | Wait 5-30s | Streaming animation kicks in, fields populate |
| 12 | Open Inngest dashboard | See `product-ingest` run with green steps |
| 13 | Vercel logs → grep `[step-timing]` | Each step <8000ms; any >9000ms warning is a flag |
| 14 | GET `/admin/cost` | Today's usage shows the vision call's tokens + NT$ amount |
| 15 | GET `/api/health` | Returns `{ ok: true }` |

If any step fails, see Troubleshooting at the bottom.

### D.7 — Verify rollback works (do this once before relying on it)

1. Vercel → Deployments → "..." on the current deploy → "Promote to Production" via a PREVIOUS green deploy
2. Confirm the old version is now serving (homepage still works, but maybe missing latest features)
3. Promote the new deploy back

Knowing rollback works is more valuable than never needing it.

### D.8 — README badge (optional)

Add a "Live demo" link to README.md so visitors can find the URL:

```markdown
[![Live demo](https://img.shields.io/badge/demo-live-success)](https://demo-sass-2.vercel.app)
```

---

## Post-deploy — what to monitor first 7 days

Daily 30-second check:

| Check | Where | Action if bad |
|---|---|---|
| Vercel function errors | https://vercel.com → project → Logs → Errors | Investigate top error |
| Inngest run failures | https://app.inngest.com → app → Runs → Failed | Check signing key, Neon reachability |
| Neon compute hours | https://console.neon.tech → project → Usage | If >50% of 100h cap, investigate bot pressure |
| OpenAI spend | https://platform.openai.com → Usage | Should stay near $0 unless real users; cap will fire at $10 |
| R2 storage growth | https://dash.cloudflare.com → R2 → bucket → metrics | At 10 GB free, plenty of headroom |

---

## Rollback runbook

### Code rollback (last deploy was bad)
1. Vercel Deployments → find a previous green deploy → "Promote to Production"

### Schema rollback (a migration broke prod)
1. The matching `*.rollback.sql` exists for every migration:
   ```bash
   psql "$NEON_OWNER_URL_UNPOOLED" -f drizzle/migrations/0008_v2_merchant_auth.rollback.sql
   ```
2. Manually remove the row from `__migrations__`:
   ```bash
   psql "$NEON_OWNER_URL_UNPOOLED" \
     -c "DELETE FROM __migrations__ WHERE filename = '0008_v2_merchant_auth.sql'"
   ```
3. Deploy a code revert via Vercel rollback OR `git revert` + push to main.

### Secret rotation (a key leaked)
1. Generate the replacement (`openssl rand -hex 32` etc.)
2. Update the value in Vercel Environment Variables
3. Click "Redeploy" on the latest deploy (Vercel doesn't auto-redeploy on env change)
4. For DB role passwords specifically, use `ALTER ROLE web_anon WITH PASSWORD '<new>'` against Neon, then update both env vars.

### Demo merchant password rotation
Re-run V2.2.2 prod-mode seed with `--mode=prod` won't help (it's idempotent on email; existing merchants are skipped). To rotate:
```sql
-- In Neon SQL editor:
UPDATE merchants
SET password_hash = '<new bcrypt hash>'
WHERE slug = 'akami';
-- (Generate the hash via: pnpm tsx -e "console.log(require('bcryptjs').hashSync('newpw', 10))")
```

---

## Troubleshooting

### "Inngest run failed: invalid signature"
- Cause: `INNGEST_SIGNING_KEY` in Vercel doesn't match the one in Inngest Cloud.
- Fix: Re-copy from Inngest dashboard → paste into Vercel → redeploy.

### "Vision step timed out (>10s)"
- Cause: Vercel Hobby caps every function at 10s. Sharp + cold Neon + vision can blow that.
- Verify: `vercel logs | grep '[step-timing]'` — if `call-vision` is consistently >9000ms, you have two options:
  - Upgrade Vercel to Pro ($20/mo, 60s per-fn) — kills the "$0/mo" pitch but unblocks
  - Reduce image size before vision (already at 1024x1024 in `product-ingest.ts`; could drop to 768x768)

### "Neon project paused — out of compute hours"
- Cause: Sustained traffic (real or bot) kept Neon warm past 100h/mo.
- Fix in order: (1) add Cloudflare in front of `*.vercel.app` to filter bot scans, (2) upgrade Neon to Launch tier ($19/mo), (3) downgrade autosuspend window to be more aggressive.

### "Preview deploy 500s on every request"
- Cause: Likely V2.2.10 F4 guard firing — Preview env got `STORAGE_BACKEND=r2` accidentally.
- Fix: Vercel env → confirm `STORAGE_BACKEND` is `local` (or unset) in Preview scope, and `R2_*` vars are NOT in Preview scope.

### "All routes 5xx after deploy"
- Cause: Almost always env validation. Open `vercel logs --since 5m`, look for "Invalid environment configuration".
- Fix: Address the listed missing/malformed vars in Vercel env, redeploy.
- If you can't fix immediately: roll back via Vercel Deployments → "Promote previous deployment" while you investigate.

### "Storefront images broken (404 from R2)"
- Cause: Bucket `Public access` not enabled, OR `R2_PUBLIC_URL` mismatched bucket public domain.
- Fix: R2 dashboard → bucket → Settings → confirm public URL, paste into Vercel `R2_PUBLIC_URL`, redeploy.

### "Photo upload returns 503 INNGEST_UNAVAILABLE"
- Cause: Inngest webhook can't be reached, OR signing key wrong.
- Fix: D.3 step — re-sync app URL in Inngest dashboard, confirm signing key matches Vercel env.

### "ADMIN_SESSION_SECRET too short"
- Cause: Generated <32 chars. env.ts asserts ≥32.
- Fix: `openssl rand -hex 32` produces 64 chars (32 bytes hex). Re-paste, redeploy.

---

## Out of scope (deferred — when to revisit)

| Item | When to revisit |
|---|---|
| Custom domain | When you want a portfolio-friendly URL (`demo.example.com`) |
| Cloudflare in front | When bot pressure exhausts Neon's 100h compute |
| Preview per-PR Neon branches | When schema migrations land frequently and shared `preview` branch causes flakes |
| GitHub release-tag promotion gate | When you stop wanting push-to-main = auto-deploy |
| OpenTelemetry / Sentry | When errors get hard to debug from Vercel logs alone |
| Manual DB backup script | Currently rely on Neon PITR (free tier ~24h retention) |
| SLSA / cosign provenance | Overkill until external trust requirements emerge |

---

## Index of supporting V2.2 work

Every step above maps to a V2.2 commit on this branch:

| Phase step | V2.2 commit | What's verified |
|---|---|---|
| B.2 role bootstrap | V2.2.3 + V2.2.10 | `db/init/prod-roles.template.sql` `\gexec` form |
| B.3 migrations | V2.2.0 + V2.2.10 | `pnpm db:migrate` runs all 10 SQL files via custom runner |
| B.5 pgBouncer verify | V2.2.6 | `scripts/db/verify-pgbouncer.ts` 100-iter RLS check |
| B.6 prod-mode seed | V2.2.2 + V2.2.10 | random passwords, suspended state, host-based safety guard |
| C.3 env validation | V2.2.1 | `src/lib/env.ts` zod-parses at instrumentation boot |
| C.3 SSL config | V2.2.1 | `src/db/index.ts` explicit `ssl: { rejectUnauthorized: true }` |
| C.3 pool sizing | V2.2.1 | `max=1` per pool in production |
| C.3 storage backend | V2.2.4 | facade in `src/lib/storage/index.ts` dispatches by env |
| C.4 Preview guard | V2.2.10 | `src/instrumentation.ts` throws if `VERCEL_ENV=preview && STORAGE_BACKEND=r2` |
| D.3 vision flow | V2.2.5 | route enqueues, `/api/products/generate/status` polls |
| D.6 step timing | V2.2.9 | `[step-timing]` log lines per Inngest step |
| D.6 cost cap | V1.5 + V2.2.5 | app-level `assertWithinDailyCap` + worker writes `ai_usage_events` |
| D.6 health check | V2.2.1 + V2.2.7 | `/api/health` pings dbUser + dbAdmin |
| Threat model | V2.2.8 | ARCHITECTURE.md §4.4 honest about web_admin + Inngest blast radius |

CI workflow at `.github/workflows/ci.yml` runs everything that doesn't need the cloud — exactly what V2.2 hardening was for.
