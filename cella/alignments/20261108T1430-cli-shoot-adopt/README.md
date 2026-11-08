---
breaking: false
clientCacheBump: false
grep: cella screenshots, cella contributions, cella forks
---

# pnpm cella screenshots is now pnpm cella shoot

Change the app's own scripts, docs and agent prompts that name `pnpm cella screenshots` to `pnpm cella shoot`, and those
that name `pnpm cella contributions` to `pnpm cella adopt`. `pnpm cella forks` is gone: an app upgrades from inside its
own repo with `pnpm cella upgrade`.

## What & why

From `@cellajs/cli` 0.7 the two commands carry shorter names, and the old names answer `unknown command`. `forks` is gone
because an agent now runs each app's upgrade inside that app. The `forks` list in `cella/cella.config.ts`,
`cella/screenshots.ts` and the `@cellajs/cli/screenshots` export keep their names.

## Blast radius

Only an app whose own scripts, docs or prompts name an old command; any other app gets this for free. No wire, database,
lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Replace `pnpm cella screenshots` with `pnpm cella shoot` and `pnpm cella contributions` with `pnpm cella adopt` in the app's own scripts, docs and agent prompts.
2. Replace a step that runs `pnpm cella forks` with `pnpm cella upgrade` run inside each app.

## Verify

```sh
pnpm cella shoot --help
pnpm check
```
