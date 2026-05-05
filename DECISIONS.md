# Standing Decisions

Conventions Claude (or any contributor) applies WITHOUT asking. The point of this
file: stop asking the operator about routine choices that have already been made.
If a question's answer is here, just do it. Read once at session start, follow.

If a NEW pattern emerges that should join this list, add it as a PR alongside the
work that introduced it.

If you genuinely think a documented decision is wrong for the current task, STOP
and ask the operator — don't silently override.

---

## Git workflow

- **Branch naming**: `v{major}.{minor}.{patch}-{kebab-feature}` for sprints, or
  `{type}/{kebab-summary}` for one-offs (`fix/image-url-leak`, `chore/dependabot`).
- **Commit format**: conventional commits (`feat(v2.2.5):`, `fix(v2.2.13):`,
  `docs(v2.2.14):`, `chore:`, `test:`, `refactor:`, `ci:`). Always include a
  `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` trailer
  for AI-assisted commits.
- **Commit message body**: `[gstack-context]` block when in continuous-checkpoint
  mode, otherwise plain prose. Always say WHY (the bug / the why), never just
  WHAT (which is in the diff).
- **PR title** = subject of the squash commit that lands. Match the commit
  format.
- **Merge strategy**: ALWAYS squash and merge. Never rebase merge, never merge
  commit. Keeps `main` linear.
- **Force push**: only on feature branches with `--force-with-lease`. Never on
  `main`. Branch protection enforces.

## Pre-PR checklist (always run, in order)

1. `pnpm typecheck` clean
2. `pnpm lint` clean
3. `pnpm vitest run` 260+/260+ green
4. (UI changes) restart dev server, browser-verify the change
5. Stage only intentional files (`git add <paths>`, never `git add -A` / `git add .`)
6. Commit with conventional format
7. Push, open PR

If ANY step above fails, fix before pushing. Don't push broken or partial state.

## CI / deploy

- **Region**: `sin1` (Singapore). Closest to Neon Singapore + R2 APAC.
- **Vercel function memory**: default 2 GB (Fluid Compute on). Don't change unless
  Vercel logs show OOM in `[step-timing]`.
- **Vercel cron**: don't add without explicit ask. Hobby plan limit is small.
- **Inngest dev CLI**: required for any local photo upload / import flow. CI uses
  fake keys, accepts 503 INNGEST_UNAVAILABLE.
- **CI workflow**: `pnpm dev` (NOT `pnpm start`) for HTTP test server in
  `.github/workflows/ci.yml`. Production env validation requires `sslmode=require`,
  CI postgres is plain TCP, only dev mode is compatible.
- **Auto-deploy**: Vercel auto-deploys `main`. Don't disable.

## Database / migrations

- **Custom runner**: `pnpm db:migrate` (V2.2.0 `scripts/db/migrate.ts`). Drizzle's
  built-in `migrate` is deprecated for this repo — `_journal.json` is incomplete.
- **Filename format**: `^\d{4}[a-z]?_.+\.sql$`. Letter suffix lets you slot
  hand-written between drizzle-generated.
- **Migration runner enforces format** at startup; malformed filenames fail loud.
- **Connection mode**: prod uses pooled (Neon `-pooler` host), local docker uses
  unpooled (no -pooler).
- **`db:push`**: dev only, never prod.
- **Production role bootstrap**: `db/init/prod-roles.template.sql` with
  `--set ON_ERROR_STOP=on -v web_anon_password=... -v web_admin_password=...`.
  Never replay `db/init/01-roles.sql` (LOCAL ONLY) on prod.

## Storage

- **Default backend**: `STORAGE_BACKEND=local` (file-based). Production sets
  `STORAGE_BACKEND=r2`.
- **Image URLs in JSX**: always use `imageUrlFor()` from
  `@/lib/storage/public-url-client`. Never hardcode `/uploads/${r2Key}`.
- **Image URLs in server-side exports** (CSV / XLSX): use `getPublicUrl()` from
  `@/lib/storage` for absolute URLs.
- **Preview env**: `STORAGE_BACKEND=local` (Vercel guard throws if `=r2`).

## Secrets

- **Generate locally**: `openssl rand -hex 32` for session secrets, `openssl rand
  -hex 16` for passwords, `openssl rand -base64 24` for DB role passwords.
- **Vault flow**: generate → display once → save to 1Password / age-encrypted
  file → paste into Vercel UI → `rm -P` the temp file. Never echo full secret to
  shell history (use `set -o noclobber` or write straight to vault file).
- **Operator owns vault**. Never check vault credentials into the repo. Never
  share via chat / email / Slack.
- **Two distinct session secrets**: `ADMIN_SESSION_SECRET` ≠
  `MERCHANT_SESSION_SECRET`. Each ≥32 chars (env validation enforces).
- **OpenAI key**: separate prod key from dev key. Set $10/mo hard cap at
  platform.openai.com.

## Dependencies

- **Package manager**: pnpm. Never npm or yarn for installs.
- **Lockfile policy**: `--frozen-lockfile` in CI + Vercel. Update lockfile
  intentionally (`pnpm up next@latest` etc.) and commit lockfile alongside
  package.json change.
- **Major version bumps**: same major only by default (`pnpm up next@^15.5`,
  not `next@latest` which crosses major). Cross-major upgrades go in their own
  PR with explicit testing.
- **Security advisories**: respond same-week. Vercel hard-blocks deploy on
  known vulns (V2.2.10 lesson with Next.js 15.0.3 → 15.5.15).

## Testing

- **vitest**: 260+ tests, all green is the bar. New code adds new tests
  proportional to surface (rough heuristic: integration tests for new HTTP
  routes, unit tests for new pure functions, e2e for new user flows).
- **No regressions ever**: if a test starts failing on a PR, fix it before
  merging. Never `vitest run --skip` to land a PR.
- **HTTP integration tests** (touching `/api/*`, `/admin/*`, `/merchant/*`):
  require dev server running on `localhost:3000`. Tests gracefully skip if
  server is down (see existing pattern in `tests/v1-integration.test.ts`).
- **Postgres-bound tests**: require local docker postgres. RLS e2e + migration
  runner tests mutate temp DBs.

## UI

- **Brand vars**: use `var(--brand-primary)` / `var(--brand-bg)` etc. NEVER
  hardcode color hex / Tailwind raw color classes (`bg-zinc-*`, `bg-red-50`).
  ESLint enforces.
- **Radius**: `var(--brand-radius)` everywhere. Don't hardcode `rounded-lg`.
- **shadcn/ui components**: use the project's variants. Don't fork them inline.
- **Loading / empty / error states**: every async surface specifies all three.
- **Touch targets**: 44px minimum on mobile.

## Security / RLS

- **dbUser** is the default for any user-facing route. Imports allowed
  everywhere.
- **dbAdmin** is BYPASSRLS. ESLint allowlist (`eslint.config.mjs`) controls
  who can import. New file needing `dbAdmin` must be added to the allowlist
  with a one-line justification comment.
- **withTenantTx**: use for any user-action SQL. Never hand-roll
  `set_config('app.tenant_id', ...)`.
- **Public routes**: any route under `/api/*` not gated by admin or merchant
  session must explicitly handle tenant resolution.
- **Cookies**: `HttpOnly + Secure (prod) + SameSite=Strict (admin) /
  Lax (merchant)`. Don't change without security review.

## What requires human (don't auto-decide)

- Strategy / direction / what feature to build
- Premise gates from `/autoplan`
- User Challenges (both models recommend changing user direction)
- Destructive ops on prod: `DROP TABLE`, `DELETE FROM` without WHERE,
  `git push --force` to main, secret rotation rollouts
- New service signups (Cloudflare account, Inngest org, etc.)
- Vault writes (operator owns vault)
- OAuth approvals (operator's identity)
- Payment / billing actions

## Chinese vs English

- Operator writes/speaks 繁體中文 + technical English mixed. Match this style
  in prose.
- Code (variable names, comments, commit messages, PR descriptions) stays in
  English unless context-specific (Chinese product names like `永康街選物店`,
  `夜市第三攤` are kept as-is).
- ARCHITECTURE / STATUS / CHANGELOG / DEPLOY / DECISIONS docs: English with
  inline Chinese where the original concept was Chinese.

## When in doubt

If a decision isn't here, prefer:
- Less code over more code
- Fewer dependencies over more
- Explicit over clever
- Reuse what exists over rebuilding
- Test it before pushing
- Read the diff one more time before merging

These mirror the gstack 6 principles. They're already part of how this repo
ships.
