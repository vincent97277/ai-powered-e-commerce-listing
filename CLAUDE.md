# CLAUDE.md — for AI agents working in this repo

> Self-contained agent doc. Read this file alone and you can do most routine tasks correctly. Deeper material is linked from the bottom — only follow links when the task requires.

This file targets Claude Code, Cursor, Copilot, and any other coding agent. The same content is referenced from [AGENTS.md](./AGENTS.md) and applies regardless of vendor.

## What this project is

`demo-sass-2` — a Taiwan multi-merchant e-commerce demo. Multi-tenant Postgres with Row-Level Security (RLS), AI photo→listing via GPT-4o, admin observability, and a per-merchant authentication system. Live at https://demo-sass-2.vercel.app. Apache-2.0 portfolio project, V2.3.

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
4. **No raw color classes (`bg-zinc-*`, `bg-red-50`) or raw `rounded-lg`.** Use `var(--brand-primary)` / `var(--brand-bg)` / `var(--brand-radius)`. ESLint will block raw colors at PR time.
5. **Don't import `dbAdmin` outside the allowlist** in `eslint.config.mjs` (currently `(admin)/**`, `lib/observability/**`, `lib/admin/**`, `lib/onboarding/**`, Inngest workers, system queries). User-facing routes use `dbUser` + `withTenantTx(tenantId, fn)`.
6. **Never hardcode `/uploads/${r2Key}` in JSX.** Use `imageUrlFor()` from `@/lib/storage/public-url-client` (client) or `getPublicUrl()` from `@/lib/storage` (server CSV / XLSX). V2.2.13 lesson.
7. **Match `/row-level security/i` and `/permission denied/i` via `expectRejectsMatching` from `tests/_helpers/db-error.ts`, not `.rejects.toThrow(/regex/)`.** Drizzle 0.45 wraps errors; `.message` is `"Failed query: ..."`, not the postgres text. V2.3.5 lesson.
8. **Don't merge without CI green.** Branch protection on `main` requires the `ci` check to pass. Auto-merge is enabled via `gh pr merge --auto`; it queues until CI flips green. Force-merge bypasses BP and breaks main (V2.3.4 lesson with #13).

## Pre-PR checklist

The canonical checklist lives in [DECISIONS.md § Pre-PR checklist](./DECISIONS.md#pre-pr-checklist-always-run-in-order). **Follow that one** — it's the single source of truth so the agent doc and the operator doc cannot drift (V2.3 retro caught a 7-vs-8-step drift within 24h of CLAUDE.md creation).

In summary: typecheck + lint + lint:docs + vitest + (UI? browser-verify) + (README media? rendered-github verify) + explicit `git add` + conventional commit + push + auto-merge via `gh pr merge --auto --squash`.

If any step fails, fix before pushing. Don't push partial state.

## Cookbook — common tasks

### "Add a new tenant-scoped merchant route"
1. Create `src/app/(merchant)/<feature>/page.tsx` (or route handler)
2. Use `dbUser.transaction(...)` wrapped by `withTenantTx(tenantId, fn)` — never `set_config` by hand
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
