---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: compute-sg, startBuilder
---

# Each environment owes an apply for a closed security group in every zone

The stack declares its closed security group, `<slug>-compute-sg`, in every zone of the region, so a builder whose machine type
is out of stock in the environment's zone is made in the next one. Each environment runs `pnpm infra apply` once; until then
its deploys end blocked and name the apply.

## What & why

Three deploys failed when Scaleway refused to power on `POP2-HC-8C-16G` in `nl-ams-1` (`412 out_of_stock`). `buildRelease` now
deletes the refused machine and tries `<region>-2`, then `<region>-3`, and deletes builders in every zone. A machine needs a
security group in its own zone, and the deploy key writes none, so `resources/compute.ts` declares one per zone and the
preflight counts security groups as privileged.

## Blast radius

Every app with a deployed stack. Breaking for operations: each environment's next deploy ends blocked at the preflight until
an apply made the two new groups. No database, cache or wire change. An app that edited `resources/compute.ts` keeps one
`SecurityGroup` per zone, all named `compute-sg`.

## Run

No script: manual.

## Manual steps

1. Per environment: `pnpm infra apply --mode <env>` (operator key) makes the groups in the region's other two zones and starts the blocked target again.

## Verify

```sh
pnpm --filter infra exec vitest run tasks/build-release.test.ts
pnpm check
```
