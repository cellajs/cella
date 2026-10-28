---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: cella sync, cella/sync, cella-sync, packageJsonSync, syncWithPackages, syncBreaking, sync-breaking
---

# pnpm cella sync is now pnpm cella upgrade

Rename `packageJsonSync` to `packageJsonKeys` and `syncWithPackages` to `mergePackageJson` in
`cella/cella.config.ts`, and change the app's own scripts, docs, prompts and pinned CI that name
`pnpm cella sync`, the `cella/sync/` branch prefix or the `cella-sync` skill.

## What & why

"Sync" names the sync engine only. From `@cellajs/cli` 0.6, bringing template changes into an app
is an upgrade: `pnpm cella upgrade` cuts `cella/upgrade/<stamp>` and commits `chore: upgrade cella
to …`. The settings `packageJsonSync` and `syncWithPackages` are `packageJsonKeys` and
`mergePackageJson`, the `cella-sync` skill is `cella-upgrade`, and an alignment's `syncBreaking`
frontmatter is `breaking`.

## Blast radius

Breaking for an app that pins or ignores `.github/workflows/ci.yml`: its upgrade PRs skip the heavy
suites until the condition names `cella/upgrade/`. Everything else keeps working in CLI 0.6, with a
warning per old name. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In `cella/cella.config.ts`, rename `packageJsonSync` to `packageJsonKeys` and `syncWithPackages` to `mergePackageJson`.
2. Only with a pinned or ignored `.github/workflows/ci.yml`: change `'cella/sync/'` to `'cella/upgrade/'` in each `startsWith(github.head_ref, …)`.
3. Replace `pnpm cella sync` with `pnpm cella upgrade` and `cella-sync` with `cella-upgrade` in the app's own scripts, docs and agent prompts.

## Verify

```sh
pnpm cella analyze   # no "is renamed" warning above the checkout line
pnpm check
```
