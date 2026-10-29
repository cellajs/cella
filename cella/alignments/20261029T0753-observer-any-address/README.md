---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: OBSERVER_PROJECT_PERMISSION_SETS, observerRules, extendObserverReach, setObserverAddresses, ObserverStep, inventory.machines
---

# The observer key reads no machine or image, and works from any address

The observer policy holds no Instances or registry set and no address condition, so `pnpm infra status` and `pnpm infra runs`
work from any address. Each environment runs `pnpm infra identity` once with an Owner API key; until then the observer holds
its old sets and address lock.

## What & why

`InstancesReadOnly` let the observer read each machine's user data, which holds the boot key until the deploy scrubs it (a
builder's for its whole build), so its key was held to the operator's addresses. `OBSERVER_PROJECT_PERMISSION_SETS` now names
only what status, runs and the identity plan read, and `observerRules` carries no condition. Update identities compares the
observer policy and replaces its rules in place. `inventory.machines` lists machines with the operator key.

## Blast radius

Every app with a deployed stack, for operations only. No database, cache or wire change. Without an operator key in the
session, `inventory.machines` reports `unknown`. An app that added sets to the observer reviews each against what a key
from any address may read.

## Run

No script: manual.

## Manual steps

1. Per environment: `pnpm infra identity --mode <env>` with an Owner API key that expires within a day. The first run replaces the rules of `<app>-observer-policy`, which serves every environment; the observer key on each machine keeps working, now from any address.

## Verify

```sh
pnpm infra identity --mode <env>   # The identities of <env> are as declared.
pnpm --filter infra exec vitest run tasks/setup-observer-app.test.ts
pnpm check
```
