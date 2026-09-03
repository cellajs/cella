# App table classifications and scheduled jobs move out of cella-owned files

## What & why

1. **Table classifications**: pinned `backend/src/tables.ts` exports `appPartitionConfigs`
   (pg_partman entries: Drizzle `table` plus `partitionColumn`/`interval`/`retention`),
   `appFullCrudTables` and `appReadOnlyTables` (grant lists outside RLS); `10-partman.migration.ts`,
   `10-rls.migration.ts`, `99-verify.migration.ts` and `backend/tests/partman-parity.test.ts` merge
   them after cella's entries. `PartitionConfig` moves into `tables.ts`.
2. **Scheduled jobs**: `defineBackendModule({ jobs: [{ name, start }] })` in
   `backend/src/lib/module.ts` (or `registerBackendJob` outside a module); `start` returns the stop
   handle; `main.api.ts` starts jobs under the migration-owner guard and stops them on shutdown.
   First registrant: `scheduleDbMaintenance` (`backend/src/lib/db-maintenance.ts`).

## Blast radius

Sync-breaking for apps that appended tables to `partitionConfigs`, `fullCrudTables`,
`readOnlyTables`, the parity test map, or scheduled a job in `main.api.ts`: after sync those
tables lose grants and partitioning and the job stops starting. Untouched apps are
unaffected. `tables.ts` is pinned: copy the new type and exports by hand. No `clientCacheVersion`
bump, no schema change.

## Run

No script: manual.

## Manual steps

1. In `backend/src/tables.ts`, add the `PartitionConfig` type and the three exports from cella's
   version, then move each app entry:
   - `backend/scripts/migrations/10-partman.migration.ts`: `{ name: 'x', partitionColumn, interval,
     retention }` becomes `{ table: xTable, partitionColumn, interval, retention }` in
     `appPartitionConfigs`.
   - `backend/scripts/migrations/10-rls.migration.ts`: `fullCrudTables` names go to
     `appFullCrudTables`, `readOnlyTables` names to `appReadOnlyTables`.
   - `backend/tests/partman-parity.test.ts`: delete the app table import and map entry (the map
     extends itself from `appPartitionConfigs`).
2. Per job in `backend/src/main.api.ts`: add `jobs: [{ name: '<job>', start: () => schedule<Job>() }]`
   to the owning module's `defineBackendModule`, then delete the import, the `stop<Job>` variable,
   the guarded call and the cleanup line.
3. Remove the matching `// fork:` markers from the four cella files.

## Verify

```sh
pnpm --filter backend test -- tests/partman-parity.test.ts   # passes and lists the app table
pnpm --filter backend migrate                                # logs "verify: ... passed"
pnpm check
# boot the API with RUN_MIGRATIONS_ON_BOOT=true: "[startup] scheduled jobs:" must name every job
```
