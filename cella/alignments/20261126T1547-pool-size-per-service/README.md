---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: DATABASE_POOL_MAX, YJS_DATABASE_POOL_MAX, processIdentityEnv
---

# Each deployed service sizes its database pool in the service registry

Every service in `infra/config/services.config.ts` now sets its pool size in its `env`: `DATABASE_POOL_MAX` for the
backend image's services, `YJS_DATABASE_POOL_MAX` for the relay. `processIdentityEnv` names `DATABASE_POOL_MAX`, so a
co-hosted worker's size never folds onto the `singleVM` host. An app's own service gives itself a size by the rule
above `appServices`, and an app regenerates `compose.gen.yml`.

## What & why

Every backend-image process opened a runtime pool of 20, the default in `backend/src/env.ts`. With pg-boss, the admin
pool, the CDC worker and the relay, the ceilings passed the 97 connections of a database at Postgres's default
`max_connections` during a `start-first` deploy, split or under `singleVM`. The registry now sizes each pool, and the
rule in its JSDoc keeps the worst deploy overlap within 87.

## Blast radius

Every deployed app, through the registry merge; nothing fails at a wrong size. A service of the app's own keeps the
default 20 until it names one. An app whose own co-hosted service set `DATABASE_POOL_MAX` beside the host's no longer
fails compose synthesis. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. Not caught by anything. For each service of the app's own in `infra/config/services.config.ts` that opens a database pool, add its size to `env`, and recount the total by the rule above `appServices` with every pool the app's own code opens.
2. An app whose busiest service needs a larger pool takes the connections from another service or raises `max_connections` on the database, and says so beside the number.
3. Run `pnpm --filter infra compose:generate`: `infra/compose.gen.yml` is app-owned and does not merge.
4. Per deployed environment, run `pnpm cella infra apply`: the registry is part of the applied description, so the next release ends apply needed until then.

## Verify

```sh
pnpm --filter infra compose:check
pnpm --filter infra test
pnpm check
```

By hand: after a deploy, the `db.client.connection.limit` metric of each service shows the size its `env` names.
