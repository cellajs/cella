---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: protect, memberShutOut, operatorSecretImports, OPERATOR_SECRET_IMPORTS, operator-secret-imports
---

# Teardown in one act

A teardown (**Tear down stack**) now takes the typed `<slug>-<mode>` and one Owner API key, writes a final dump of the database into the boot-diag bucket, deletes everything that runs or costs with the environment's identities, and keeps the upload buckets, the boot-diag bucket, the state bucket and the keys that protect stored data, which the next setup adopts. No step is owed for a running environment. An app resource in `infra/resources/` that sets `protect` fails `tests/unit/resource-contracts.test.ts`.

## What & why

`protect` is gone from the program: the typed name and an Owner key that ends within a day guard a teardown. `lib/stack/kept-resources.ts` names what a teardown keeps (`retainOnDelete` in the program) and the `importPlan` a setup runs before its first `up`. `memberShutOut` became `shutOutOfBuckets`, and `operator-secret-imports.ts` went: third-party keys are deleted with the other secrets and asked again at the next setup.

## Blast radius

Every app with an environment, at its next teardown. No database, cache or lens change. An app that never added resources or scripts to `infra/` is unaffected. Until the next apply, a hand `pulumi destroy` deletes what a teardown keeps.

## Run

No script: manual.

## Manual steps

1. No step for a running environment: a teardown takes the kept resources out of the state, empties every other bucket on delete and lifts the protections an older program recorded, so it keeps the same set before and after the next apply.
2. An environment in the middle of its move off the machines its Pulumi program made ([20261103T1445-infra-health-switch](../20261103T1445-infra-health-switch/README.md)) finishes that move, its second apply included, before a teardown: that apply releases the addresses and flexible IPs those machines held, which a teardown leaves.
3. A destroy that stops halfway leaves what it had not reached, still in the state, with the kept resources already out of it: tear down again to finish, which writes a dump first while the database lives.
4. An app resource in `infra/resources/` drops `protect`; one a teardown must keep goes in `keptResources` (`infra/lib/stack/kept-resources.ts`) and takes `retainOnDelete: true`.
5. An app script that called `memberShutOut` calls `shutOutOfBuckets` with the key and `principal` set to `user_id:<id>`.
6. Before a teardown, the person holding the Owner key is a member of `<app>-operators` with an apply since joining: the bucket policies shut out every other key.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
```
