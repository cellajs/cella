---
syncBreaking: false
clientCacheBump: false
---

# The infra CLI has no unattended mode

`INFRA_NON_INTERACTIVE=1` and `INFRA_DEPLOY_NOW` are gone: `pnpm infra` and every `pnpm infra <action>` need a
person at a terminal. An app-owned script or workflow that drove the setup through those variables has to stop
doing so; the deploy pipeline (`pnpm --filter infra run deploy`) and the other `pnpm --filter infra <task>`
commands are unchanged and still run in CI.

## What & why

The CLI may only change infrastructure with a person at the prompt, so nothing on a machine can run it
unattended. `nonInteractive()` in `infra/cli/shared.ts` and every branch on it are removed; `--defaults`
stays, and still asks for required inputs such as the Owner API key. A run without a terminal stops at
its first question.

## Blast radius

Operators and app-owned automation that set `INFRA_NON_INTERACTIVE` or `INFRA_DEPLOY_NOW`. Not sync-breaking:
no database, cache, stack or config change. An app that only ever ran `pnpm infra` by hand has nothing to do.

## Run

No script: manual.

## Manual steps

1. Search app-owned scripts, workflows and runbooks for `INFRA_NON_INTERACTIVE` and `INFRA_DEPLOY_NOW`; run that setup in a terminal.

## Verify

```sh
git grep -n "INFRA_NON_INTERACTIVE\|INFRA_DEPLOY_NOW"
pnpm --filter infra test
pnpm check
```
