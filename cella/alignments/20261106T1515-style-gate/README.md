---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: pnpm style, check-style.ts, check-app-vocabulary, repo-files.ts, tailwind-class-rules.ts, class-tokens.ts, source-comments.ts
---

# The style check becomes `pnpm cella style`

`pnpm style` and its rule modules in `shared/scripts/` move into `@cellajs/cli` as `pnpm cella style`. Import the
`VocabularyAllowlist` type of `shared/config/vocabulary-allowlist.ts` from `@cellajs/cli/style`, delete the root
`style` script, end `lint:fix` with `cella style` and run `pnpm cella style` in CI. A rule an app added to one of the
deleted modules moves into a script of the app's own.

## What & why

Every app carried the style check's 1,400 lines and their tests unchanged. They now ship with the CLI, with the same
rules, output and exit codes, and parse with the app's own TypeScript and Tailwind. Deleted from `shared/scripts/`:
`check-style.ts`, `check-app-vocabulary.ts`, `repo-files.ts`, the nine `*-rules.ts`, `class-tokens.ts` and
`source-comments.ts` modules, and their tests.

## Blast radius

Every app on the CLI release that ships `style`. No wire, cache or schema change. The typecheck fails on the
allowlist's old import. The root `package.json` scripts and the CI workflow are the app's, so they keep calling
`pnpm style` until steps 3 and 4.

## Run

No script: manual.

## Manual steps

1. Upgrade the root devDependency `@cellajs/cli` to the release that lists `style` in `pnpm cella --help`.
2. In `shared/config/vocabulary-allowlist.ts`, import the type with
   `import type { VocabularyAllowlist } from '@cellajs/cli/style';`. The exceptions in it stay as they are.
3. In the root `package.json`, delete the `style` script and end `lint:fix` with `cella style` in place of `pnpm style`.
4. In `.github/workflows/ci.yml`, the lint job's style step runs `pnpm cella style`.
5. Where the upgrade reports a modify/delete conflict on a deleted module, the app had a rule of its own there. Move
   that rule into a script the app owns, run it after `cella style` in `lint:fix` and in CI, and delete the module.
   App scripts that imported `shared/scripts/` helpers import them from `@cellajs/cli/style` and call
   `openRepository(<repo root>)` before any other.

## Verify

`pnpm cella style` prints `[style] OK, terminology, documentation, comments and frontend code follow the required
style.` on a clean tree.

```sh
pnpm check
```
