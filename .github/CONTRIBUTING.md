# Contributing to demo-sass-2

Thanks for stopping by. This is a **portfolio / showcase project** — the source is open under Apache-2.0 so you can read, fork, and learn from it, but active maintenance is limited.

## What's welcome

- **Issues that flag specific factual bugs** in code, docs, or behavior. The README, DECISIONS.md, and ARCHITECTURE.md should be accurate; if you spot drift, open an issue (or a PR — see below).
- **Security concerns** — file an issue or email the owner; please don't post a public exploit.
- **Questions about specific patterns** (RLS, SSRF guard, AI cost cap, dbAdmin allowlist) — issues are fine; happy to explain a design decision.
- **Small, self-contained PRs** that fix a clearly-broken thing. Doc accuracy fixes are especially welcome.

## What's probably not welcome

- **Large refactors or architectural rewrites.** This is a snapshot of design decisions made at specific points in time. Re-architecting it as a learning exercise is fine on your fork, not here.
- **Dependency PRs from humans.** Dependabot handles them on a Monday cadence (see `.github/dependabot.yml`).
- **New features.** The scope is set by the V1→V2.3 history. If you have feature ideas, fork it.
- **Style-only changes** (whitespace, comment polish, renaming files for taste).

## Before opening a PR

1. Read [CLAUDE.md](../CLAUDE.md) — it's the agent-facing convention doc but humans also benefit. The "Hard rules — never violate" section is non-negotiable.
2. Read [DECISIONS.md](../DECISIONS.md) — standing engineering rules. If something there contradicts your PR's approach, open an issue first to discuss.
3. Run the pre-PR checklist (in CLAUDE.md): `pnpm typecheck`, `pnpm lint`, `pnpm lint:docs`, `pnpm vitest run` (260+ green).
4. Sign your work with `Co-Authored-By:` if you used AI assistance.

## Reporting a bug or issue

Open an issue using one of the templates in `.github/ISSUE_TEMPLATE/`. Critical: **never paste `.env` contents, connection strings, signing secrets, or API keys** in an issue. Paste only variable NAMES that are unset/misconfigured.

If you find a security vulnerability, please don't file it as a public issue. Email the repo owner (see GitHub profile).

## Build / dev environment

See [LOCAL_SETUP.md](../LOCAL_SETUP.md). Requires: Node 22+, pnpm 9+, Docker. The `preinstall` script will refuse other package managers — that's intentional.

## License

By contributing, you agree your contributions will be licensed under Apache-2.0 (the project license).
