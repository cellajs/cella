---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: runner-identity, runner-replace, runner.json, RUNNER_PROJECT_PERMISSION_SETS, extendPolicyReach, extendOperatorReach, everyMinutes
---

# The main job's schedule replaces the runner

Run `pnpm infra apply --mode <env>` once per environment: it writes a schedule on the `<slug>-main` job definition, and from then on a scheduled run at the environment's cadence deploys its target when it has no run record. Then delete the runner's machine, address, project, application, policy and key in the console, and `git rm infra/runner.json`. A runner machine left running keeps starting runs from its pinned release, which end unchanged beside the scheduled ones; once it is gone, nothing but the schedule deploys a release.

## What & why

`infra/runner/`, `infra/lib/runner/`, the `runner-identity` and `runner-replace` actions and `RUNNER_PROJECT_PERMISSION_SETS` are gone. The main job's definition carries `cron` from `schedule.everyMinutes` in `infra/config/general.config.ts`, and a run without `TARGET_SHA` takes the lease, finds its target and checks the run records, which now keep the retry counter. The runner was a machine that could not report its own health: on 2026-11-04 it started nothing for sixteen hours while every check read green. `schedule.last` in **Show status** now reports a schedule that stopped.

## Blast radius

Every app that deploys with the infra CLI. The deploy key's rights are unchanged. An app's own scripts calling `runner-*` actions or the removed reach helpers fail typecheck, as does an app's `general.config.ts` without `schedule`. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Upgrade every operator checkout, so no one runs the runner actions from an older one.
2. Set `schedule: { everyMinutes: { production: 1, staging: 5 } }` in `infra/config/general.config.ts` when the app owns that file, then `pnpm infra apply --mode <env>` once per environment, which writes the schedule at that cadence: the inventory names the missing schedule until then, and the first scheduled run deploys the waiting target within a cadence and a minute.
3. In the console, in the `<app>-runner` project: delete the runner machine and its reserved address.
4. In IAM: delete the `<app>-runner` application with its policy and key; the inventory lists it as an application that can act in the environment until then.
5. Delete the `<app>-runner` project once it is empty.
6. `git rm infra/runner.json` and drop its line from `cella/cella.config.ts`: the upgrade leaves both, as the app owns them.
7. Record [20261105T1400-infra-runner-registry-read](../20261105T1400-infra-runner-registry-read/README.md) as handled by this one when it is still open: the runner it fixes is gone.

## Verify

`pnpm infra status --mode <env>` shows `inventory.mainJob` and `schedule.last` ok, and `pnpm infra runs --mode <env>` says when the last scheduled run started.

```sh
pnpm check
```
