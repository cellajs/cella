---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: pnpm infra runs, pnpm infra secrets, pnpm infra start-deploy, pnpm infra operator-key, pnpm infra identity, pnpm infra state-prune, Infrastructure changes, Operators & keys
---

# The infra menu lists six daily rows, and six commands take the word of their row

Rename the commands the app's own docs, scripts and runbooks run: `pnpm infra runs` to `logs`, `secrets` to `env`, `start-deploy` to `deploy`, `operator-key` to `operators`, `identity` to `identities` and `state-prune` to `state-remove`. Rewrite each menu path they name to the new menu: six rows, then **More**.

## What & why

The menu lists Full status, Review & apply changes, Env vars & secrets, Releases & roll back, Deploy logs and Open or Close DB access, without headings or row letters. A row's command is a word of its name. **More** holds the rest under headings, Deploy now and Preview changes included: releases deploy by themselves. The old command names are refused as unknown actions.

## Blast radius

Every app that deploys with the infra CLI, where its own docs, scripts or runbooks name an old command or a moved menu path. Template docs are updated. No database, cache, lens or deploy change.

## Run

No script: manual.

## Manual steps

1. Replace each old command in the app's docs and scripts: `runs` with `logs`, `secrets` with `env`, `start-deploy` with `deploy`, `operator-key` with `operators`, `identity` with `identities`, `state-prune` with `state-remove`.
2. Drop the row letters (`d`, `a`, `p` and the others) from the app's docs: the menu has none. Rewrite menu paths: **Infrastructure changes** → **Review & apply changes** reads **Review & apply changes**, and **Operators & keys**, **Repair** or **Infrastructure changes** → an action reads **More** → that action.
3. A path to Deploy now, Update identities, Seed database, Reset database or Tear down reads **More** → that action.

## Verify

`pnpm infra help` lists `logs`, `env` and `deploy`, and `pnpm infra runs` answers that no action has that name.

```sh
pnpm check
```
