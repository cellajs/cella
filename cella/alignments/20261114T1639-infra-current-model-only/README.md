---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: healthExpectStatus, legacyServers, forgetRetiredResources, moveToRuntimeFolder, admitOperatorToBuckets, retiredApplications
---

# The infra engine serves the current model only

Before this upgrade, run `pnpm infra apply` and `pnpm infra identity` once more per environment, from the checkout the app is on, until the apply prints "The state holds no retired resource." and Update identities reports the identities as declared. After it, an apply no longer moves an environment off machines the Pulumi program made, per-consumer secret copies, the admin application or the machine identities. Drop `healthExpectStatus` from the app's own entries in `infra/config/services.config.ts`.

## What & why

Gone: `tasks/retire-program-machines.ts`, `tasks/move-secret-paths.ts`, `forgetRetiredResources`, `admitOperatorToBuckets`, the `bootstrap:legacyServers` pool servers, the secret aliases, the `/<slug>-<mode>/` prefix move, the retired admin and machine applications in Update identities, the `infra:vmAccessKey` and `infra:applicationId` stack markers, a role password read back from a connection string, and `healthExpectStatus`. Every apply exported the state and took a lease to look for resources that environments on the current model never hold.

## Blast radius

Every app that deploys with the infra CLI. An environment that applied and updated its identities since the schedule replaced the runner is unaffected. Any other sees its machines, database roles and secret versions as deletes in the plan. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Before the upgrade, per environment: `pnpm infra apply --mode <env>`, a deploy, and a second apply, until the apply prints "The state holds no retired resource." and `infra/Pulumi.<mode>.yaml` holds no `bootstrap:legacyServers` key.
2. Before the upgrade, per environment: `pnpm infra identity --mode <env>` until it reports the identities as declared and names no retired application.
3. An environment that cannot do steps 1 and 2 is torn down from its present checkout and set up anew after the upgrade.
4. After the upgrade: remove `healthExpectStatus` from the app's own entries in `infra/config/services.config.ts`, which typecheck names.
5. After the upgrade: decline an apply whose plan deletes a machine, a database user or a secret version, and go back to step 1 from the earlier checkout.
6. In the console, delete an application named `<slug>-<mode>-admin`, `-vm-<service>`, `-builder` or `-boot` that **Full status** lists as not declared.

## Verify

```sh
pnpm infra status --mode <env>
pnpm infra preview --mode <env>
pnpm check
```
