---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: PG_CRON_DATABASE, scheduleRetention
---

# The jobs worker runs apply_retention() nightly

Every deployed app gives its jobs process `DATABASE_ADMIN_URL`, or the new nightly `retention` job fails with
`retention: DATABASE_ADMIN_URL is not set, apply_retention() did not run`. `PG_CRON_DATABASE`, `scheduleRetention` and
the migrate step that scheduled pg_cron are gone.

## What & why

Retention ran only where pg_cron was granted, which Scaleway refuses the admin role, so production never removed an
aged row. The `retention` job of the entities module (`runRetention`, cron `15 3 * * *`) now calls
`apply_retention()` over the admin connection. `schedule-retention.ts`, `getAdminDbFor`, the `PG_CRON_DATABASE` env
and the infra grant on Scaleway's `rdb` database (`CRON_HOME_DATABASE`) are removed.

## Blast radius

Every deployed app. The template's infra now routes the admin DSN to the `jobs` service; an app with its own
`stores.config.ts` or another host adds it by hand. The first run on a database that never ran retention may remove a
large backlog. No schema or wire change.

## Run

No script: manual.

## Manual steps

1. Give the jobs process `DATABASE_ADMIN_URL`: with the template's infra, add `'jobs'` to `admin` in `secretConsumers` of `infra/config/stores.config.ts`; elsewhere, set it in the jobs service's environment. A `singleVM` deploy already has it.
2. Remove `PG_CRON_DATABASE` from the migrate step's environment, `release.env` in `infra/config/services.config.ts` and any `.env`, then run `pnpm infra:compose` and commit `infra/compose.gen.yml`.
3. A database where the migrate step scheduled pg_cron still runs that job too: unschedule it in pg_cron's database with `SELECT cron.unschedule('apply-retention')`.
4. Take a backup before the first run on a database with data: that run removes every row past its period at once.

## Verify

```sh
pnpm check
```

After a deploy, the jobs worker's start log names `retention` among its next runs and holds no `DATABASE_ADMIN_URL`
warning; the next morning the jobs health shows a completed `retention` run.
