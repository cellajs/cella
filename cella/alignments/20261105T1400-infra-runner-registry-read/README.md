---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: RUNNER_PROJECT_PERMISSION_SETS, extendPolicyReach
---

# The runner reads the registry

Run **Set up the runner** (`pnpm infra runner-identity`) with an Owner API key once per app whose runner serves an environment on the applied engine ([20261103T1559-infra-applied-engine](../20261103T1559-infra-applied-engine/README.md)): `<app>-runner-policy` gets `ContainerRegistryReadOnly` beside `ServerlessJobsFullAccess`, under the same address condition. Until then the runner starts no run, a release waits for a hand `pnpm infra start-deploy`, and no check says so: the refusal is one line on the runner's serial console.

## What & why

The main job runs the engine image from the environment's registry, and Scaleway refuses a start of it (403, `registry` read on the namespace and the image) to a caller without registry read. `RUNNER_PROJECT_PERMISSION_SETS` in `infra/lib/scaleway/permissions.ts` holds both sets. `extendPolicyReach` rewrote a policy only for a missing project: it now also rewrites one that lacks a declared set, so the setup reaches a runner that exists.

## Blast radius

Every app with a runner and an environment that applied the engine image: one Owner moment per app, no deploy by the runner until it ran. No database, cache or lens change. The running runner machine keeps its key and needs no replacement.

## Run

No script: manual.

## Manual steps

1. `pnpm infra runner-identity --mode <env>` with an Owner API key that expires within hours: it reports the runner's policy as extended.
2. Within a few minutes the runner starts the waiting target by itself; `pnpm infra runs --mode <env>` shows the run.

## Verify

```sh
pnpm --filter infra exec vitest run lib/scaleway/policy-reach.test.ts
pnpm infra runs --mode <env>
pnpm check
```
