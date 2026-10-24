---
syncBreaking: true
clientCacheBump: false
---

# Tombstones go after the deleted-items period, and every delete queues its files

`pnpm generate` adds the `deleted_storage` table, a delete trigger on every entity table, the `<table>_deleted_at_index`
of each product table, and drops `attachments.purged_at`. An app product table that stores files names its columns in
`backend/src/db/storage-columns.ts`. An app handler of `organization.deleted` that deleted storage can go.

## What & why

`apply_retention()` removes product tombstones older than `appConfig.retention.deletedItemsDays` (the row holding its
organization's newest `seq` stays). Each entity table's statement-level delete trigger writes what a deleted row
stored into `deleted_storage`; the `deleted-storage-cleanup` job deletes the files and retires the Yjs documents,
also after an FK cascade. The CDC worker ignores a tombstone's removal, and a device away longer than
`activityDays` starts over. The `attachment-files-purge` job and `purgedAt` are gone.

## Blast radius

Every app: a schema migration, and tombstones older than the period are removed at the first nightly run. Apps with
product tables that hold files, or code that read `purgedAt`. No client cache bump: `purgedAt` was never on the wire.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; it asks no question when the app's product tables use `productIndexes`.
2. For an app product table with stored files, add its columns to `storageColumnsOf` in `backend/src/db/storage-columns.ts`, and its reading to `ownedObjectsOf` in `backend/src/modules/entities/operations/clear-deleted-storage.ts` when its shape is neither `bucket_name` plus `keys` nor an image URL.
3. Remove app code that reads `purgedAt` or calls `purgeDeletedAttachmentFiles` / `purgeOrganizationFiles`.
4. An app that set `deletedItemsDays` keeps it at least `activityDays + 30`: the config check refuses a shorter one at startup.

## Verify

```sh
pnpm generate
pnpm --filter backend test
pnpm --filter cdc test
pnpm check
```
