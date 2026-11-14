---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: isSoftDeleteTransition, isAlreadySoftDeleted, buildStreamChange, stripEmbeddingReferences, action === 'update', deletedAt != null
---

# A soft delete is a delete on the stream and in the activities

The CDC worker records a product's soft delete as action `delete` carrying the tombstone (`<type>.deleted`), with the
row before it as `oldRowData`, where it recorded an `update` with `deletedAt` in its changed fields. An app's own
listener, activity reader or frame handler that found a soft delete in an update now finds it in a delete.

## What & why

The bus called a soft delete `<type>.deleted` while the stream and the activities called it an update, so each consumer
re-derived the ending from `deletedAt` pairs. One name for one ending: `isTombstone` in `cdc/src/utils` replaces
`isSoftDeleteTransition` and `isAlreadySoftDeleted`. A tombstone keeps its seq, so the client fetches it as it fetched
the update, and the tab that deleted it skips its own echo.

## Blast radius

Every app: `clientCacheVersion` is bumped. Code of an app's own that listens to `<type>.updated` for a soft delete,
reads activities with `action = 'update'` and `deleted_at` in `changed_fields`, calls `stripEmbeddingReferences`
with an action, or tests a soft delete's stream change. No database change.

## Run

No script: manual.

## Manual steps

1. Move app logic that reacts to a soft delete from an `activityBus` `<type>.updated` listener that checks `deletedAt` to a `<type>.deleted` listener; a delete whose `rowData.deletedAt` is set is a soft delete, one without it a hard delete or an unpublish.
2. An app query or report over `activities` that finds soft deletes by `changed_fields` containing `deletedAt` reads `action = 'delete'` from now on; older rows keep the update form.
3. An app test that passes a soft delete to `buildStreamChange` sends it as a `delete`: the change removes a row on a delete alone, and an update with `deletedAt` now names the row for a refetch.
4. Bump the app's own `clientCacheVersion` when it sets one.

## Verify

```sh
pnpm check
pnpm --filter cdc-worker exec vitest run src/tests/parse-message.test.ts
```

Then delete a row in one tab and check that a second tab drops it, and that the first tab fetches nothing for its own delete.
