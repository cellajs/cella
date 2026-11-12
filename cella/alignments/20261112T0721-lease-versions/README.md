---
breaking: true
clientCacheBump: false
caughtBy: nothing
---

# One apply per environment stops the lease from filling with versions

After this upgrade, run `pnpm infra apply` once in every environment that deploys on the schedule. The apply deletes the lease's old versions, publishes the engine whose idle scheduled runs write nothing, and expires the lease's versions after a day. An environment left on the old engine stops deploying and applying about six days after its schedule started.

## What & why

`scheduledVerdict` took and released the lease, `control/<mode>/lock.json` in the boot-diag bucket, on every scheduled run. At a run a minute the versioned bucket kept 2,880 entries a day, and near 9,000 versions Scaleway refused the object's writes: "The current object has too many versions". A run now looks first and takes the lease only for a target to deploy. An operator action deletes the lease's history before it takes the lease.

## Blast radius

Every environment with a schedule, whatever the app customized. Once Scaleway refuses the lease, no scheduled deploy and no operator action starts until the apply from the upgraded checkout. The app keeps serving. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Per environment, from the upgraded checkout: `pnpm infra apply`. Where the history was long it prints "Deleted <n> old versions of the lease".

## Verify

`pnpm infra status`: the Schedule row reads ok once a scheduled run has ended after the apply. Then `pnpm check`.
