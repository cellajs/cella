---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: startTargetAfterRotation, readRecord, readLog, RunStore, ObserverReadBootDiagnostics
---

# Rotations redeploy the live release, run records are read by their first version

Run **Review & apply changes** (`pnpm infra apply`) once per environment: the boot-diag bucket policy now lets the observer list and read object versions, which `pnpm infra runs` and `status` need. Rotate keys and Rotate secrets deploy the live release before the target, and app containers on service machines can no longer reach the metadata service.

## What & why

`redeployAfterRotation` in `infra/cli/actions/start-deploy.ts` replaces `startTargetAfterRotation`: a rotation deploys the control object's live commit, follows the run, then starts the target when it differs, so a failing target never leaves machines on deleted keys. `RunStore.readRecord` and `readLog` return a `Growth`: the newest version that grows the first, with the `rewrite` that broke the chain. The boot launcher drops the Docker bridge's traffic to `169.254.42.42` at every boot.

## Blast radius

Every deployed app, at its next apply and rotation. No app code, database or cache change; an app that reads the run store in its own code adapts to `Growth`. Until the apply, `pnpm infra runs` cannot list versions and fails on the observer key.

## Run

No script: manual.

## Manual steps

1. `pnpm infra apply` (`--mode staging` too) applies the bucket policy; the next deploy puts the metadata rule on every machine.
2. An app script that called `startTargetAfterRotation` calls `redeployAfterRotation` with the operator key pair; one that read `readRecord(run)` as a record reads `.newest` and shows `.rewrite` when set.

## Verify

```sh
pnpm infra runs
pnpm check
```
