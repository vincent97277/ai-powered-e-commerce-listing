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

This is the **canonical** pre-PR checklist for this repo. CLAUDE.md links here; do not duplicate it elsewhere.

1. `pnpm typecheck` clean
2. `pnpm lint` clean
3. `pnpm lint:docs` (README drift checker) clean
4. `pnpm vitest run` 260+/260+ green
5. (UI changes) restart dev server, browser-verify the change
6. (README media changes) verify the rendered README on github.com after merge — see § "Media embedding on GitHub README"
7. Stage only intentional files (`git add <paths>`, never `git add -A` / `git add .`)
8. Commit with conventional format
9. Push, open PR

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
- **Branch protection on `main` is required.** The V2.3.2 auto-merge workflow
  uses `gh pr merge --auto`, which only actually waits for CI when there is at
  least one required status check. Without branch protection, `--auto` falls
  through to immediate merge — which is how PR #13 landed with red CI in V2.3.4.
  Required check: `ci`. Squash-only enforced via repo setting. Admins may bypass
  for emergency hotfixes. **BP state is asserted weekly** by
  `.github/workflows/assert-branch-protection.yml` (V2.3.9) so silently disabling
  it via UI fails the workflow loudly.

## Media embedding on GitHub README

V2.3.8 spent 4 PRs converging on the right pattern. Codify so future media
landings don't re-walk the path.

- **For inline `<video>` rendering on GitHub README**, the `src=` MUST point to
  `https://github.com/user-attachments/assets/<uuid>`. This is the ONLY origin
  GitHub's HTML sanitizer allowlists. Raw repo URLs / `raw.githubusercontent.com` /
  external CDNs (jsDelivr, raw.githack) all get the `<video>` tag stripped.
- **The user-attachments URL is generated only via web UI drag-drop** into any
  github.com comment box (issue / PR / discussion). There is no public CLI/API.
  Drag-drop, copy the URL from the auto-inserted markdown, abandon the comment.
- **Always commit the source media in-repo** at `docs/hero/walkthrough.mp4` (or
  similar). The user-attachments URL is decoupled from this repo and could
  theoretically rot. Reference the in-repo file from a fallback link below the
  `<video>` tag for raw access / mirrors / npm-package-page rendering.
- **Mirror video to a GitHub Release asset** (`gh release upload <tag>
  docs/hero/walkthrough.mp4`) for a stable, durable URL that doesn't depend on
  user-attachments hosting.
- **Verify rendering on github.com after merge** — README sanitizer behavior is
  not testable locally. The pre-PR checklist explicitly requires browser-verify
  for any README media change. (V2.3.8 caught the `<video>` strip only after
  shipping.)

## Tests

- **drizzle-orm 0.45+ error wrapping**: when asserting against driver-level
  error text (postgres "row-level security policy", "permission denied"), use
  `expectRejectsMatching(promise, /regex/)` from `tests/_helpers/db-error.ts`.
  Never `.rejects.toThrow(/driver-text/)` — drizzle wraps the original error in
  `DrizzleQueryError` with `.message = "Failed query: ..."`, so the regex never
  matches. The helper walks the `.cause` chain. Application-level error text
  (thrown by our own code) can keep using `rejects.toThrow` directly.

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

## Sprint hygiene

- **Sub-version inflation rule**: a sub-version (e.g. `V2.3.8.1`) is reserved
  for shipped capability changes, not bug-chase commits within an unreleased
  version window. Bug fixes for `V2.3.x` go on `V2.3.x` itself or fold into the
  next capability bump. Don't tag `V2.3.8.1` for "fix the previous sub-version."
  V2.3 retro caught this pattern — V2.3.8.1 + V2.3.8.2 should have been a
  single follow-up commit on V2.3.8 or rolled into V2.3.9.
- **Platform contract probe pattern**: before shipping anything that depends on
  third-party platform behavior (GitHub Actions event payloads, GitHub HTML
  sanitizer rules, dependency error shapes, vendor API quirks), run a 5-minute
  probe FIRST. Examples:
  - GitHub workflow events → `gh api` + paste actual JSON into plan
  - Major dep bump → read CHANGELOG between `from..to`, grep for "BREAKING"
  - Embedded media in markdown → find the renderer's sanitizer allowlist
  - Auth pattern (login matcher, signed cookies) → run on an existing live
    sample before writing the matcher
  V2.3 retro: 4 sequential fixes (Dependabot login string, drizzle `.cause`,
  video sanitizer, user-attachments URL) all share this signature. Each was
  avoidable with a 5-minute probe.

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
