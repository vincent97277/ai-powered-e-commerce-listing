## Summary

<!-- 1-3 sentences on WHY this change matters, not just what it does. The diff shows what; the description shows the WHY. -->

## Changes

- 

## Pre-PR checklist

- [ ] `pnpm typecheck` clean
- [ ] `pnpm lint` clean
- [ ] `pnpm lint:docs` (README drift checker) passes
- [ ] `pnpm vitest run` — 260+ green (no skips, no `--skip`)
- [ ] (UI changes) browser-verified in `pnpm dev`
- [ ] Conventional commit format on the squash-merge title (`feat(v2.3.x):` / `fix:` / `chore:` / etc.)
- [ ] No `.env` / secrets / preview URLs leaked in description
- [ ] Read [CLAUDE.md § Hard rules](../CLAUDE.md#hard-rules--never-violate) — none violated

## Out of scope (deferred)

<!-- Anything you noticed but intentionally didn't fix in this PR. Goes here, not in the diff. -->
