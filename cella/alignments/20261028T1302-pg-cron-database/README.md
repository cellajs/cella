---
syncBreaking: true
clientCacheBump: false
caughtBy: tests
grep: PG_CRON_DATABASE, cron.database_name
---

# The migrate step reads pg_cron's database from PG_CRON_DATABASE

An app on the template's infra regenerates `infra/compose.gen.yml` (`pnpm infra:compose`) so the backend's release
companion gets `PG_CRON_DATABASE: rdb`. An app that deploys elsewhere, with an admin role that is no superuser, sets
`PG_CRON_DATABASE` on its migrate step to the database pg_cron runs in.

## What & why

Since the deploy's migrate step schedules the retention job, it read `cron.database_name`, a superuser-only setting.
Scaleway's admin user may not read it, so every deploy failed with `permission denied to examine "cron.database_name"`.
`scheduleRetention` now takes `PG_CRON_DATABASE` when set, and `services.config.ts` sets it from `CRON_HOME_DATABASE`.

## Blast radius

Every app that deploys a release with the retention job (0.26.0 on). `compose.gen.yml` is app-owned, so the synced
`services.config.ts` change reaches a deploy only once the app regenerates it. No database, lens or
`clientCacheVersion` change. Development and tests read the setting as before.

## Run

No script: manual.

## Manual steps

1. Run `pnpm infra:compose` and commit `infra/compose.gen.yml`: the backend-release block gains `PG_CRON_DATABASE: rdb`.
2. An app whose `infra/config/services.config.ts` diverged from the template keeps `PG_CRON_DATABASE: CRON_HOME_DATABASE` in the backend's `release.env`.
3. An app deploying outside the template's infra on a non-superuser admin role sets `PG_CRON_DATABASE` in its migrate step's environment.

## Verify

```sh
pnpm --filter infra compose:check
pnpm check
```
