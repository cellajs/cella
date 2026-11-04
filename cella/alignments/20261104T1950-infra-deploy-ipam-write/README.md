---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: IPAMReadOnly, DEPLOY_PROJECT_PERMISSION_SETS
---

# The deploy key writes IPAM

Run **Update identities** (`pnpm infra identity`) with an Owner API key once per environment that already moved its machines out of Pulumi ([20261103T1445-infra-health-switch](../20261103T1445-infra-health-switch/README.md)): `<slug>-<mode>-ci-deploy-policy` gets `IPAMFullAccess` in place of `IPAMReadOnly`. Until then every deploy fails at "Switch machines" with a bare 500 from the Instance API on the private NIC. An environment that has not run that alignment yet gets the set with its own identity update.

## What & why

A deploy attaches each new machine's private NIC at a reserved address, which the Instance API does as an IPAM write with the caller's rights. Under `IPAMReadOnly` Scaleway answers 500 "Internal error", with no 403 to name the gap, and IPAM has no narrower write set. `DEPLOY_PROJECT_PERMISSION_SETS` in `infra/lib/scaleway/permissions.ts` now holds `IPAMFullAccess`; the test on the deploy key's sets and KEYS.md say what a leaked key can do with it.

## Blast radius

Every app with an environment deployed on reserved addresses: one Owner moment each, no deploy until it ran. No database, cache or lens change. An app whose `infra/` is the template's has only the step below.

## Run

No script: manual.

## Manual steps

1. `pnpm infra identity --mode <env>` with an Owner API key that expires within hours: the plan shows the deploy policy's IPAM rule changing; confirm.
2. `pnpm infra start-deploy --mode <env>` when a run ended failed at "Switch machines" on the private NIC: the runner never starts a failed target again.

## Verify

```sh
pnpm --filter infra exec vitest run tasks/permission-sets.test.ts
pnpm infra runs --mode <env>
pnpm check
```
