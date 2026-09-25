# Partition retention moves from pg_partman to maintain_partitions() and pg_cron

## What & why

pg_partman is gone: Scaleway Managed PostgreSQL does not offer it, so production never
partitioned anything, and its `run_maintenance()` ran from an in-process timer that production
never started. `10-partitions.migration.ts` now converts the same tables to native range
partitions and installs `maintain_partitions()`, which pg_cron calls nightly (scheduled by
`backend/scripts/db/schedule-partition-maintenance.ts` from `migrate.ts` and boot). The dev
image `backend/db/Dockerfile` ships pg_cron instead of pg_partman. `sessions`, `tokens` and
`unsubscribe_tokens` leave partitioning: plain `id` primary keys, retention by DELETE in the
same procedure (migration `20260923092234_tidy_bruce_banner` flattens partitioned copies).

## Blast radius

Touches the database and the dev image. Sync-breaking for every app: `pnpm dev` with
`RUN_MIGRATIONS_ON_BOOT=true` fails until the db image is rebuilt with pg_cron, and a Scaleway
stack needs the new `admin-cron-privilege` on `rdb` applied before the next migrate. Code that
targeted sessions, tokens or unsubscribe tokens by `(id, expiresAt)` or `(id, createdAt)` now
targets `id`. Apps that only listed `appPartitionConfigs` need no code change.

## Run

No script: manual.

## Manual steps

1. `pnpm docker:test:reset`, then rebuild both db images: `docker compose -f backend/compose.yaml --profile test build`.
2. `backend/drizzle` is app-owned (the default sync config ignores it): `pnpm generate` writes the primary-key change for `sessions`, `tokens` and `unsubscribe_tokens` and regenerates the side-effects migration (`partition_setup` replaces `partman_setup`). A database that an earlier migration partitioned needs the flatten block first: copy the `DO $$ ... $$` statement from the template's `20260923092234_tidy_bruce_banner/migration.sql` to the top of your generated migration.
3. If you imported `#/lib/db-maintenance` or ran `scripts/db-maintenance.ts`, delete those references; the job now lives in pg_cron.
4. Simplify any `and(eq(sessionsTable.id, …), eq(sessionsTable.expiresAt, …))` (same for tokens and unsubscribe tokens) to the `id` predicate; `tokens.id` is now a plain primary key other tables may reference.
5. Apps on Scaleway: CLI **Apply infra change** so the admin user gets `all` on the `rdb` database, before the next release migrates.
6. Any extra compose file that runs `backend/db` (devcontainers) adds `-c shared_preload_libraries=pg_cron -c cron.database_name=postgres`.

## Verify

```sh
pnpm --filter backend test -- tests/partition-parity.test.ts
pnpm --filter backend migrate            # logs "verify: ... passed"; then in psql: SELECT * FROM cron.job;
pnpm check
```
