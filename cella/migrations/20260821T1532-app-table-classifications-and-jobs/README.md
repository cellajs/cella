# App table classifications and scheduled jobs move out of cella-owned files

## What & why

Two backend registration points replace edits to cella-owned files.

1. **Table classifications** for the side-effect migrations now come from `backend/src/tables.ts`
   (pinned fork file): `appPartitionConfigs` (pg_partman conversions, each entry carrying its
   Drizzle `table` plus `partitionColumn`/`interval`/`retention`), `appFullCrudTables` and
   `appReadOnlyTables` (grant lists for tables outside RLS). `10-partman.migration.ts`,
   `10-rls.migration.ts`, `99-verify.migration.ts` and `backend/tests/partman-parity.test.ts`
   merge these after cella's own entries, so the partition map, grants, verify assertions and the
   parity test all derive from one app-owned list. The `PartitionConfig` type moves from the
   partman migration into `tables.ts`.
2. **Scheduled jobs** register on the module hub: `defineBackendModule({ jobs: [{ name, start }] })`
   in `backend/src/lib/module.ts` (or `registerBackendJob` for code outside a module). `start`
   schedules the job and returns its stop handle. `main.api.ts` starts every registered job under
   the migration-owner guard and stops them all on shutdown; `scheduleDbMaintenance` is the
   first registrant (`backend/src/lib/db-maintenance.ts`).

## Blast radius

Sync-breaking for apps that appended tables to `partitionConfigs`, `fullCrudTables`,
`readOnlyTables`, the parity test map, or scheduled a job in `main.api.ts`: those edits now
conflict on sync and, once cella's version wins, the app's tables lose their grants and
partitioning and the job no longer starts. Apps that never touched these files are unaffected.
Since `tables.ts` is pinned, the fork's copy keeps the fork's version after sync: copy the new
`PartitionConfig` type and the three exports into it by hand. No `clientCacheVersion` bump.
No schema change; the generated SQL is identical once the entries are moved.

## Run

No script — manual.

## Manual steps

1. In `backend/src/tables.ts`, add the `PartitionConfig` type and the three exports from cella's
   version, then move each app entry out of the cella files:
   - `backend/scripts/migrations/10-partman.migration.ts` entry
     `{ name: 'x', partitionColumn, interval, retention }` becomes
     `{ table: xTable, partitionColumn, interval, retention }` in `appPartitionConfigs`.
   - `backend/scripts/migrations/10-rls.migration.ts` names in `fullCrudTables` go to
     `appFullCrudTables`, names in `readOnlyTables` to `appReadOnlyTables`.
   - `backend/tests/partman-parity.test.ts`: delete the app table import and map entry; the map
     now extends itself from `appPartitionConfigs`.
2. For each job scheduled in `backend/src/main.api.ts`: add
   `jobs: [{ name: '<job>', start: () => schedule<Job>() }]` to the owning module's
   `defineBackendModule` call, then delete the import, the `stop<Job>` variable, the call under
   the migration guard and the cleanup line from `main.api.ts`.
3. Remove the matching `// fork:` markers from the four cella files so the next sync is clean.

## Verify

`pnpm --filter backend test -- tests/partman-parity.test.ts` passes and lists the app table;
`pnpm --filter backend migrate` logs `verify: ... passed`; boot the API with
`RUN_MIGRATIONS_ON_BOOT=true` and check the `[startup] scheduled jobs:` line names every job;
`pnpm check`.
