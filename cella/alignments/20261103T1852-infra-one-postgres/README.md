---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: redisManaged, externalUrl, redisUrl, mongoUrl, configuredOrRandomSecret, logicalReplication, stores.primary, @pulumi/random
---

# One Postgres store

Per environment, one `pnpm infra apply --mode <env>` after the upgrade: the store's settings in `infra/config/stores.config.ts` lose `roles` and `logicalReplication`, so the applied description changes, and a release with this change ends **apply needed** until that apply starts it again. An app whose `stores.config.ts` differs from the template passes all four consumer lists; one that kept a removed store kind, `validate()` or `StoreOps` fails typecheck.

## What & why

Every app runs one store, `postgresManaged`, so the kinds no app registered are gone: `redisManaged`, `externalUrl`, `redisUrl`, `mongoUrl`, `databaseUrl` and `none`. `StoreProvisioner` loses `validate()` and `ops` (`StoreOps`), `ProvisionContext` loses `configuredOrRandomSecret`, and `infra` loses `@pulumi/random`. `postgresManaged` takes all four `secretConsumers` lists; its three roles and logical replication are fixed. The `stores.<storeId>` status check is gone.

## Blast radius

Every app with a deployed environment: one apply each, which changes no resource the app runs on. No database, cache or lens change. A script reading `pnpm infra status --json` finds no `stores.primary` check.

## Run

No script: manual.

## Manual steps

1. `pnpm infra apply --mode <env>` from a checkout with this change, once its target carries it. The plan changes no resource the app runs on; the apply records the new description and starts the target again.
2. An app's own `postgresManaged({...})` call drops `roles` and `logicalReplication` and passes `secretConsumers` with `runtime`, `admin`, `cdc` and `ca`, each a list of services; `[]` for a role no service reads declares no secret for it.
3. An app's own store factory in `infra/resources/stores/` drops `validate` and `ops`: a check it ran there moves to the top of its `provision()`, as the public endpoint check of `postgres-managed.ts` does. One that called `configuredOrRandomSecret` makes its secret in an operator task, as `tasks/ensure-database.ts` does, so the value stays out of the Pulumi state.
4. An app module that imports `@pulumi/random` adds it back to `infra/package.json`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm check
pnpm infra status --mode <env>
```
