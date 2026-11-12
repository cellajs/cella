---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: lifecycle: 'owned', gcOwnedEmbeddedRows, unreferencedItemsDays
generate: true
---

# Owned rows are collected by the nightly retention run

Every app adds `retention.unreferencedItemsDays` to `shared/config/config.default.ts`. An app that declares an
embedding with `lifecycle: 'owned'` also runs `pnpm generate` and first counts what the new rule collects: the CDC
worker no longer soft-deletes an owned row when its id leaves a host.

## What & why

The CDC worker soft-deleted an owned row the moment a host write dropped its id (`gcOwnedEmbeddedRows`, removed), and
an undo then named a deleted row: the block came back without its file. `apply_retention()` now soft-deletes a row of
an owned embedding that no live host names, once it is `retention.unreferencedItemsDays` old. Until that run the row
is live, which is what an undo finds. Nothing comes back from a tombstone.

## Blast radius

Every app for the config key. With an `owned` embedding: a removed row stays live and counted in its tenant's quota
until a run, rows no host ever named are collected too, and each migration that installs the procedure runs it once.
No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Add `unreferencedItemsDays: 30` to `retention` in `shared/config/config.default.ts`: higher keeps a form's upload longer before its host is saved, lower frees the quota of a removed row sooner.
2. With an `owned` embedding, run the count under Verify on every database with data before its migration runs there: the migration calls the procedure, which soft-deletes those rows in one transaction.
3. A count that holds rows the app still shows means a host array is behind its documents: derive the arrays again through the app's own host write first, or those files go.
4. A row the worker collected while a document still shows its block stays deleted: to keep it, clear its tombstone and add its id to the host array in one statement, before `retention.deletedItemsDays` passes.
5. Declare an embedding `shared` when rows of its type also live without a host by design; the config refuses an owned embedding of a type in itself.
6. Run `pnpm generate`: it writes a side-effect migration whose `apply_retention()` holds a block per owned embedding. No rename hints and no hand-written SQL.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```

The rows the first run soft-deletes, here for attachments that tasks own. Add one `NOT EXISTS` per host of the type; a
host that holds a single id compares `h.<column>_id = e.id`:

```sql
SELECT count(*) FROM attachments e
WHERE e.deleted_at IS NULL AND e.created_at < now() - interval '30 days'
  AND NOT EXISTS (SELECT 1 FROM tasks h, unnest(h.attachments) AS named(id)
    WHERE h.deleted_at IS NULL AND h.organization_id = e.organization_id AND named.id = e.id);
```
