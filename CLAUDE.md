# CLAUDE.md — for AI agents working in this repo

> Self-contained agent doc. Read this file alone and you can do most routine tasks correctly. Deeper material is linked from the bottom — only follow links when the task requires.

This file targets Claude Code, Cursor, Copilot, and any other coding agent. The same content is referenced from [AGENTS.md](./AGENTS.md) and applies regardless of vendor.

## What this project is

`rls-ai-shop` — a Taiwan multi-merchant e-commerce demo. Multi-tenant Postgres with Row-Level Security (RLS), AI photo→listing via GPT-4o, admin observability, and a per-merchant authentication system. Live at https://rls-ai-shop.vercel.app. Apache-2.0 portfolio project, V2.3.

The architecture is summarized in [README.md § Architecture](./README.md#architecture). The deeper technical doc is [ARCHITECTURE.md](./ARCHITECTURE.md). For a concise version table, see [STATUS.md](./STATUS.md).

## Stack snapshot (V2.3)

- **Runtime**: Node 22, pnpm 9 (locked via `packageManager` + `only-allow`)
- **Framework**: Next.js 15 App Router, Turbopack dev, React 19, TypeScript strict
- **DB**: Postgres 16 (Docker locally, Neon in prod), Drizzle ORM 0.45+
- **Auth**: HMAC cookies for admin, DB-backed sessions for merchant
- **Storage**: Local filesystem in dev, Cloudflare R2 in prod (toggle via `STORAGE_BACKEND`)
- **AI**: OpenAI GPT-4o vision; cost-capped per-day via `assertWithinDailyCap()`
- **Background jobs**: Inngest (dev CLI required for AI batch flows)
- **Tests**: Vitest 2 (260+), Playwright (post-deploy smoke against prod)
- **CI**: GitHub Actions (`ci.yml`, `auto-merge.yml`, `post-deploy-smoke.yml`)

## Hard rules — never violate

These have all caused a real PR-breaking incident. They are not suggestions.

1. **Use `pnpm`. Never `bun*`, `npm install`, `yarn`.** A `preinstall` script blocks the wrong manager. The README and DECISIONS document this; agents that copy-paste from old commits or training data will reach for `bun` — don't.
2. **Use `pnpm db:migrate` (the custom runner). Never `pnpm db:push` for prod or onboarding.** `db:push` bypasses the migration filename guard and `WITH CHECK` policies in 0001a/0003/0007. It silently works in dev iteration only.
3. **Stage files explicitly. Never `git add -A` / `git add .`.** It will pick up `.env.local`, `test-results/`, `.next/`, or your scratch files. Pass paths.
4. **No ad-hoc brand/accent color classes or raw radius on tenant-facing surfaces.** Use `var(--brand-*)` and project tokens. Zinc / shadcn neutrals are allowed only for neutral platform chrome or shared primitives where they're not expressing merchant brand (borders, muted text, disabled states). Brand surfaces (buttons, badges, accents, brand backgrounds) MUST use `var(--brand-primary)` / `var(--brand-bg)` / `var(--brand-radius)`. ESLint enforces — when in doubt, run `pnpm lint`.
5. **Don't import `dbAdmin` OR `dbUser` outside the allowlist** in `eslint.config.mjs` (admin / observability / Inngest / lib system paths + 3 narrow user-facing exceptions: `(merchant)/layout.tsx`, `(storefront)/store/*/layout.tsx`, `(merchant)/merchant/settings/actions.ts`). User-facing **read** code uses `withTenantTx(tenantId, async (tx) => ...)` — the wrapper IS dbUser-backed; calling `dbUser` directly skips the GUC and fail-closes to 0 rows (V2.6.x Tier 1 #4 added dbUser to the rule because the "0 rows → switch to dbAdmin" debug instinct is the actual leak). New file needing `dbAdmin` → justify why and add to the exact-file allowlist (V2.6 narrowed away from `(merchant)/**` / `(storefront)/**` glob; do not re-add the glob).
6. **Never construct public storage URLs by hand.** Three contexts, three helpers:
   - **Client Component** (`"use client"`): `imageUrlFor()` from `@/lib/storage/public-url-client`
   - **React Server Component** (default in App Router) and any server-rendered HTML: `getPublicUrl()` from `@/lib/storage`
   - **Server-only data export** (CSV / XLSX / metadata / JSON response): `getPublicUrl()` from `@/lib/storage`
   RSC is the common trap — looks like client JSX but runs on the server, so the client helper builds wrong URLs in production R2 mode. V2.2.13 lesson.
7. **Match `/row-level security/i` and `/permission denied/i` via `expectRejectsMatching` from `tests/_helpers/db-error.ts`, not `.rejects.toThrow(/regex/)`.** Drizzle 0.45 wraps errors; `.message` is `"Failed query: ..."`, not the postgres text. V2.3.5 lesson.
8. **Don't merge without CI green.** Branch protection on `main` requires the `ci` check to pass. Auto-merge is enabled via `gh pr merge --auto`; it queues until CI flips green. Force-merge bypasses BP and breaks main (V2.3.4 lesson with #13).

## Pre-PR checklist

The canonical checklist lives in [DECISIONS.md § Pre-PR checklist](./DECISIONS.md#pre-pr-checklist-always-run-in-order). **Follow that one** — it's the single source of truth so the agent doc and the operator doc cannot drift (V2.3 retro caught a 7-vs-8-step drift within 24h of CLAUDE.md creation).

In summary: typecheck + lint + lint:docs + vitest + (UI? browser-verify) + (README media? rendered-github verify) + explicit `git add` + conventional commit + push + auto-merge via `gh pr merge --auto --squash`.

If any step fails, fix before pushing. Don't push partial state.

## Common errors → fix

When the agent's terminal / CI output contains one of these strings, the fix is mechanical:

| Symptom (substring in error) | Root cause | Fix |
|---|---|---|
| `ERR_PNPM_BAD_PM_VERSION` / `only-allow pnpm` | Tried `bun install` / `npm install` / `yarn` | Run `corepack enable && pnpm install`. The `preinstall` script enforces pnpm. |
| `Failed query:` matching expected `/row-level security/i` or `/permission denied/i` | Drizzle 0.45+ wraps the postgres error; `.message` is the templated query, real text is on `.cause.message` | Use `expectRejectsMatching(promise, /regex/)` from `tests/_helpers/db-error.ts` (V2.3.5 helper). |
| `Multiple versions of pnpm specified` in CI | Both workflow `version:` and `package.json packageManager` set | Drop `version:` from the workflow step; `package.json packageManager` is single source of truth (V2.3.6 lesson). |
| Auto-merge fires immediately on PR (no CI wait) | Branch protection missing or `ci` not in required checks | Verify via `gh api repos/.../branches/main/protection`; the assert workflow runs Mondays (V2.3.5 lesson). |
| `<video>` element renders blank on github.com README | GitHub HTML sanitizer strips `<video>` whose `src` is not on the user-attachments allowlist | Drag-drop the .mp4 into a github.com comment box, copy the `https://github.com/user-attachments/assets/...` URL, paste into README. NO public CLI for this (V2.3.8 lesson). |
| Dependabot PR opened but didn't auto-merge | `gh pr view --json author` returns `app/dependabot`, not `dependabot[bot]` | The auto-merge workflow now matches both — ensure your matcher does too (V2.3.5 lesson). |

If your error string isn't in this table, check [DECISIONS.md § Sprint hygiene § Platform contract probe](./DECISIONS.md#sprint-hygiene) — most third-party platform quirks have a documented allowlist or contract you can probe before guessing.

## Cookbook — common tasks

### "Add a new tenant-scoped merchant route"
1. Create `src/app/(merchant)/<feature>/page.tsx` (or route handler)
2. Use `await withTenantTx(tenantId, async (tx) => tx.select()...)` — the wrapper opens a dbUser transaction, sets `app.tenant_id` GUC, and gives you `tx`. Never call `dbUser` / `dbAdmin` directly (ESLint blocks both per hard-rule #5), never `set_config` by hand
3. Schema additions go in `src/db/schema.ts` + a new migration `drizzle/migrations/NNNN_<name>.sql` with `WITH CHECK` on tenant_id
4. Run `pnpm db:migrate` to apply
5. Tests: integration test in `tests/v1-integration.test.ts`, unit tests for any pure helpers

### "Add a new admin-only route"
1. Create `src/app/(admin)/<feature>/page.tsx` (or route handler)
2. Import `dbAdmin` from `@/db` directly — `(admin)/**` is in the ESLint allowlist
3. The `(admin)` layout already enforces session validation via `validateAdminSession()`; don't reimplement
4. Tests: `tests/admin/<feature>.test.ts`

### "Add a new env var"
1. Add to `.env.local.example` with a placeholder + comment
2. Add validation in `src/lib/env.ts` (Zod schema)
3. Reference via `env('YOUR_VAR')` — never `process.env.YOUR_VAR` directly
4. Document in `LOCAL_SETUP.md` step section if user-facing

### "Add a new Dependabot-style dependency PR"
Don't. Dependabot opens these on Mondays via `.github/dependabot.yml`. The `auto-merge.yml` workflow handles trusted updates (patch/minor for npm, any for github-actions). For manual upgrades, open a normal PR with `chore(deps):` and let it go through human review for cross-major bumps.

### "Drop a DB column / table"
This is a `## What requires human` situation per [DECISIONS.md](./DECISIONS.md). Flag it, don't auto-decide.

### "Smoke test the AI vision flow after an SDK / vision-path change"
Don't manually click through the 7-step checklist. Run the automated smoke instead:

```bash
# Terminal 1: pnpm dev
# Terminal 2: pnpm inngest:dev
# Terminal 3:
pnpm test:smoke:ai-local
```

What it does (replaces V2.6.2's manual checklist): preflight-checks env + DB + dev server + Inngest CLI all reachable, then logs in as `akami@demo.local`, uploads `tests/fixtures/smoke-product.jpg`, waits up to 90s for the AI-generated product to appear, asserts the title is NOT a fixture-fallback string, and queries `ai_usage_events` directly to confirm tokens > 0 (the load-bearing assertion that catches silent token-shape zeroing across SDK majors). Cleans up the test product on success.

Cost: ~$0.02 in OpenAI tokens per run. Total runtime: ~90 seconds. Run on demand, not in CI (`*-local.smoke.ts` is excluded from the post-deploy chromium project).

## Things that look like a fork in the road but aren't

- **Production vs dev DB connection mode**: prod uses `-pooler` host, local Docker uses unpooled. Don't try to "unify" — they're correct as-is.
- **Two session secrets**: `ADMIN_SESSION_SECRET` ≠ `MERCHANT_SESSION_SECRET`. Don't reuse.
- **`db/init/01-roles.sql`** is **LOCAL DEV ONLY** (Docker entrypoint). Production roles come from `db/init/prod-roles.template.sql` via psql with `\gexec`.
- **`STORAGE_BACKEND`** is `local` in dev + Vercel preview, `r2` only in production. The Vercel guard throws if preview tries to use R2.

## Testing conventions

- New HTTP route → integration test (skip-aware: `if (!r) return;`)
- New pure function → unit test
- New tenant-touching SQL → an RLS case (or extend `tests/rls.e2e.test.ts`)
- New AI call → cost-cap test in `tests/ai/`
- DB-bound rejection assertions → use `expectRejectsMatching` from `tests/_helpers/db-error.ts`

## When you don't know

If a decision isn't in DECISIONS.md and isn't covered above, prefer:
- Less code over more code
- Fewer dependencies over more
- Explicit over clever
- Reuse what exists over rebuilding
- Test it before pushing
- Read the diff once more before merging

If genuinely stuck, **stop and ask the operator** rather than guessing on architecture-shaped questions.

## Pointers (for deeper dives)

- [DECISIONS.md](./DECISIONS.md) — standing engineering rules (the canonical source for the "Hard rules" above)
- [ARCHITECTURE.md](./ARCHITECTURE.md) — 7 sections covering data model, RLS, AI pipeline, admin observability, security, frontend patterns, testing strategy
- [LOCAL_SETUP.md](./LOCAL_SETUP.md) — detailed local environment setup
- [DEPLOY.md](./DEPLOY.md) — Phase B/C/D cloud-deploy runbook (Vercel + Neon + R2 + Inngest)
- [STATUS.md](./STATUS.md) — version-by-version progression with rationale
- [CHANGELOG.md](./CHANGELOG.md) — commit-level history
- [README.md](./README.md) — public-facing project intro

If something contradicts between this file and DECISIONS.md, **DECISIONS.md wins** — it's the source of truth, this file is a compressed view.
