---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: batchUntilSeq, event.subjectId, event.userId, event.changedFields, ActivityEvent, AppStreamProductEvent, fanOutNotifications, buildStreamChange, buildMoveOut, StreamChange, sync.entity_id, event.subject_id, organizationSubscribers, workerAwayPing
---

# Each row of a product change carries its own activity

A product event on the activity bus (`ProductActivityEvent`) has no `id`, `userId`, `subjectId`, `changedFields` or `stx` of its own: each of its `rows` carries `activityId`, `userId`, `changedFields` and `stx`. The `StreamChange` frame drops `subjectId`, `seq`, `stx`, `actorId`, `batchUntilSeq` and `count` for `rows: [{ subjectId, seq, stx, actorId }]`, listing only the rows its receiver may read. Past `maxStreamChangeRows` (20) a frame names no row in full and sets `overflow`: the sequence range of a create or update, nulls on a delete or a move-out, and `subjectIds`, the rows' ids up to `maxStreamChangeIds` (400), null past that, when a delete or a move-out refetches the lists of the type. `fanOutNotifications` takes a `ProductActivityEvent`, `buildStreamChange(event, rows?)` the rows to name, `buildMoveOut(event, rows)` the moved rows one reader lost: each reader gets one move-out frame per update.

## What & why

The CDC worker groups the rows of several transactions into one message, and every row took the first row's activity id, writer, stx and subject. A second writer's mention of the first was skipped as a self-mention, a user mentioned in two rows of one flush heard of one, a delete of several rows cleared one detail, file and unseen count, and a tab refetched its own multi-row write.

## Blast radius

Breaking for app code that builds or reads product events or change frames, mostly tests. During a deploy the API refuses a message of the other worker release. Until it reloads, a tab on the old bundle finds no `seq` or `subjectId` in a frame: an edit in the channel it views fails its detail fetch with an error toast and refetches every list of the type, an edit elsewhere marks the lists stale, a delete refetches them, and a move-out leaves the row in its cache. Rolling the API back to a release before this change while the new bundle is served makes every change frame fail in a new tab until its stream circuit opens: roll the frontend back with it. No database, cache or lens change. Traces lose two attributes: the client span's `sync.entity_id` is `sync.row_count`, and a product event's bus span has no `event.subject_id`.

## Run

No script: manual.

## Manual steps

1. Where an app test builds a product event for `fanOutNotifications` (raak `backend/tests/task-mention-notifications.test.ts`, projectcampus `backend/tests/comment-notifications.test.ts`), type it as `ProductActivityEvent` and move `id`, `userId` and `changedFields` from the event onto each row as `activityId`, `userId`, `changedFields`, with `stx: null`; drop the event's `subjectId`.
2. A test that builds an `AppStreamProductEvent` with a typed literal (projectcampus `backend/src/modules/entities/stream/dispatch-mirror-app.test.ts`) stops compiling: move the activity fields onto each row as in step 1, and drop the event's `id`, `subjectId`, `userId`, `changedFields` and `stx`. One that casts its event (raak `backend/src/modules/label/label-stream.test.ts`, projectcampus `backend/src/permissions/row-predicates-app.test.ts`) passes as is; drop its event-level `subjectId`, `id` and `stx`, which nothing reads.
3. App code that reads a change frame reads `change.rows`: the range is the lowest and highest `seq` of its rows, each row's `subjectId`, `stx` and `actorId` are that row's own. It handles `change.overflow` too, where `rows` is empty and `overflow.subjectIds` names the rows by id; a test that builds a `StreamChange` adds `overflow: null`, one that builds an overflow adds `subjectIds`.
4. A test that calls `buildMoveOut` passes the moved rows, each with `movedFrom`; one that counts the move-out frames of an update of several rows expects one per reader.
5. A listener of a product type that read `event.subjectId` or `event.userId` reads them per row: `row.rowData.id` and `row.userId`.
6. Code that called `organizationSubscribers(id)` reads `streamSubscriberManager.getByTopic(organizationTopic(id))`; `workerAwayPing` comes from `shared/stream-ping`; a `SyncedRows` subscriber reads no `degraded`, and hears of fetched ranges alone.

## Verify

```sh
pnpm check
```
