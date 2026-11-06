---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: db_a11y, DB_A11Y_PORT, pg_a11y_data, a11y:run --keep, a11y:run --stop, a11y/src/run.ts, localDatabaseUrl('a11y'
---

# The audit stack becomes `pnpm cella testbed`

`pnpm a11y:run` now runs the audit on a testbed, `pnpm cella testbed`, and `a11y/src/run.ts` is gone. The database it
runs on is renamed: compose service `db_a11y` is `db_testbed`, its volume `pg_a11y_data` is `pg_testbed_data`, its
port variable `DB_A11Y_PORT` is `DB_TESTBED_PORT`, and `LocalDatabase` `'a11y'` in `shared/src/local-database.ts` is
`'testbed'`. `pnpm a11y:run --keep` and `--stop` are gone: hold a testbed with `pnpm cella testbed` instead. Remove the
old container and its volume once.

## What & why

The audit, the screenshot driver and the skill drivers each started a throwaway stack of their own, two of them on the
same port. `pnpm cella testbed` in `@cellajs/cli` is that one stack for all of them: a seeded copy of the app with its
own database and ports, migrated at every start. `pnpm cella testbed -- <command>` runs a command against it.

## Blast radius

Every app on the CLI release that ships the testbed. No wire, cache or schema change. An app is affected beyond the
cleanup only when its own code or `.env` names the old service, variable or database key.

## Run

No script: manual.

## Manual steps

1. Remove the old audit database once: `docker rm -fv <slug>_db_a11y` and `docker volume rm <slug>_pg_a11y_data`,
   with the app slug of `shared/config/config.default.ts`.
2. Rename `DB_A11Y_PORT` to `DB_TESTBED_PORT` where an app's own `.env` or scripts set it.
3. Replace `pnpm a11y:run --keep` in app docs or scripts with a held `pnpm cella testbed`, and `--stop` with
   `pnpm cella testbed stop`.

## Verify

`pnpm a11y:run --states sign-in` runs on a testbed and stops it.

```sh
pnpm check
```
