# Line width 150 with shallow objects collapsed

## What & why

`biome.jsonc` `formatter.lineWidth` goes from 120 to 150, and `collapse-objects.ts` removes the line break
after `{` in shallow multi-line objects, type literals and destructuring patterns, so Biome collapses each one
that fits. Literals nested three or more levels deep, and braces holding comments, block-bodied functions or
JSX, keep their shape. Formatting only: about 18k fewer lines in the template, no code changes.

## Blast radius

Every formatted file. Not sync-breaking at runtime, no `clientCacheVersion` bump, no lens, no database.
A sync rehearsed on projectcampus and raak left 27 and 21 conflicted files: formatting of lines the app edited.

## Run

```sh
pnpm exec tsx cella/migrations/20261001T0909-line-width-150/collapse-objects.ts inventory   # report only
pnpm exec tsx cella/migrations/20261001T0909-line-width-150/collapse-objects.ts rewrite     # apply
```

Roots default to `files.includes` in `biome.jsonc`, so the app's own Biome roots are covered; pass roots to narrow.
Files identical to the upstream commit in `cella/cella.manifest.json` are skipped: they arrived formatted, and
upstream keeps some objects expanded on purpose (#1231). The run prints how many it skipped.

## Manual steps

1. Resolve the sync's formatting conflicts by keeping the app's side; files the app deleted stay deleted.
2. If the app owns `biome.jsonc`, set `"lineWidth": 150` there.
3. Run the codemod `rewrite`, then `pnpm biome format --write .` until it reports no fixes, then `pnpm lint:fix`
   (it merges string concatenations that now fit on one line into template literals) and `pnpm sdk`.

## Verify

```sh
pnpm biome format .   # reports no fixes
pnpm check
```
