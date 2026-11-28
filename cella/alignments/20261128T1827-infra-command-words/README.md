---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: actionLabel, Full status, Review & apply changes, Env vars & secrets, Releases & roll back, Deploy logs, Open DB access, Close DB access, Deploy now, Preview changes, Rotate keys, Rotate secrets, Set up operators, Update identities, Set repository read key, Remove from state, Resume setup, Seed database, Reset database, Import a .env file, Tear down
---

# The infra menu shows each action's command, and the first run of an environment is its install

The infra CLI's menu rows are the actions' commands (`status`, `apply`, `more › rotate-keys`), and `actionLabel` is gone from `@cellajs/cli/infra/contract`. The CLI says install where it said setup. Rewrite the old menu labels and the install-sense "setup" in the app's own docs, skills and scripts. The template's deployment docs and `cella/tests/docs-actions.test.ts` arrive with the upgrade.

## What & why

`@cellajs/cli` 0.12 dropped the labels (`actionLabel`, `OperatorAction.label`): the highlighted row plus the menu's title is the command to type. A menu path reads `pnpm cella infra` → **more** → **rotate-keys**. The run that takes an environment from nothing to its first deploy is the **install**: the wizard, `resume` ("continue an interrupted install"), "install not finished" in the header, and the status group **Install**.

## Blast radius

Apps whose own docs, skills or scripts name a menu label, or whose tests import `actionLabel`. No command, flag, task, stored key or check id changes. An app that kept the template's deployment docs as they are is unaffected.

## Run

No script: manual.

## Manual steps

1. In the app's own docs, skills and scripts, replace each label with its command: Full status `status`, Review & apply changes `apply`, Env vars & secrets `env`, Releases & roll back `releases`, Deploy logs `logs`, Open DB access `db-open`, Close DB access `db-close`, Deploy now `deploy-now`, Preview changes `preview`, Rotate keys `rotate-keys`, Rotate secrets `rotate-secrets`, Set up operators `operators`, Update identities `identities`, Set repository read key `repository-key`, Unlock `unlock`, Resume setup `resume`, Remove from state `state-remove`, Seed database `db-seed`, Reset database `db-reset`, Import a .env file `env-import`, Tear down `teardown`, More `more`.
2. A test of the app's own that imports `actionLabel` checks the docs against the action ids (`Object.keys(operatorActions)`) and the row labels of `menuRows`, as `cella/tests/docs-actions.test.ts` does.
3. Where the app's own docs call the first run of an environment its setup (the setup wizard, a stack "not set up yet"), write install.

## Verify

```sh
pnpm --filter cella-tools test
pnpm check
```
