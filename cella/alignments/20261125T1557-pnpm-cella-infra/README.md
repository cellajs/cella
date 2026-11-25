---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: pnpm infra, pnpm infra:compose
---

# The infra CLI runs as `pnpm cella infra`, and the root `infra` scripts are gone

Rewrite every `pnpm infra` the app's own docs, scripts and runbooks run to `pnpm cella infra`, and `pnpm infra:compose` to `pnpm --filter infra compose:generate`. Drop the `infra` and `infra:compose` scripts from the root `package.json` if the upgrade left them there.

## What & why

`pnpm cella infra` hands every word after `infra` to the infra CLI as typed, `--help` included, and prints nothing of its own. It is the one name for the deploy engine's commands, as the other moved tools run under `pnpm cella`. The root scripts `infra` and `infra:compose` are removed. Template docs, the engine's messages and the workflows name the new command.

## Blast radius

Every app that deploys with the infra CLI, where its own docs, scripts, runbooks or CI name `pnpm infra`. The engine image, the main job and CI run `pnpm --filter infra <script>`, which stays. No database, cache, lens or deploy change.

## Run

No script: manual.

## Manual steps

1. `git grep -n "pnpm infra"` and rewrite each hit outside `cella/alignments/` and the changelog: `pnpm infra` to `pnpm cella infra`, `pnpm infra:compose` to `pnpm --filter infra compose:generate`.
2. Remove the `infra` and `infra:compose` scripts from the root `package.json` if they are still there.

## Verify

`pnpm cella infra help` prints the infra CLI's usage, then `pnpm check`.
