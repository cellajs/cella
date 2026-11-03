---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: loadPreview, loadRows, mentionable, digestedAt, stampDigested, loadSubjectPreview, findOrCreatePreferences, defaultDigestFrequency, windowStart, buildDigestForUser
generate: true
---

# Notification mails take the context name, the digest settles a recipient by lastDigestAt

`ModuleNotifications` loses `loadPreview`, `loadRows` and `mentionable`: an instant mail is titled with the name `loadContextNames` gives the notification's `contextId` (else the row's `name`) and quotes the stored `description`, and every source fans out mentions. The `notifications.digested_at` column and `stampDigested` go: a digest window runs from `lastDigestAt` to the run's start, and `stampDigestRun` stamps each recipient after their mail. `findOrCreatePreferences` becomes `findPreferences`, and `defaultDigestFrequency` becomes `defaultPreferences.digest`.

## What & why

The mail title equalled the inbox and digest title in every app, and its body the stored description, so `loadPreview` read again what the context names and the fan-out's own read held. No module declared `loadRows` or `mentionable`. The digest kept its window twice, in JavaScript and in SQL, and settled rows twice, per row and per user. The preferences GET wrote a row no reader needs. The client recounted the unread badge from its 30-row page.

## Blast radius

Apps declaring `loadPreview` (raak tasks, projectcampus comments) and their tests; a projectcampus comment on a deleted or unpublished item mails with an empty title. One migration drops a column. A digest run stops taking recipients after eight minutes: past its job's expiry, a `singleVM` deploy's second jobs worker could start the next run, which without `digestedAt` mails the same recipients again. A row written during a run waits for the next window. The unread badge waits one round trip after marking some rows read. No lens or cache change.

## Run

No script: manual.

## Manual steps

1. raak `backend/src/modules/task/task-module.ts`: drop `loadPreview` from `notifications`; `loadContextNames` already titles the mail with `taskTitle`. Drop `findTaskNotificationPreview` from `backend/src/modules/task/task-queries.ts`.
2. projectcampus `backend/src/modules/comment/comment-notifications.ts`: drop `loadPreview`; the mail is titled by `loadContextNames` keyed by the item id `resolveContextId` returns. Drop `findCommentPreview` from `backend/src/modules/comment/comment-queries.ts`, and the `loadPreview` assertions from `backend/tests/comment-notifications.test.ts`.
3. projectcampus `backend/scripts/seeds/55-notifications.seed.ts` needs no code change: `mockSeedNotification` now stamps `emailedAt` on every row, so no digest mails a seeded row; correct its comment that names `digestedAt`. A seed that writes notification rows without the mock stamps `emailedAt` on them, or `lastDigestAt` for every recipient.
4. Delete `backend/src/modules/notification/operations/run-digest.test.ts` if the upgrade left it: the window it tested is SQL now.
5. Run `pnpm generate`: it alone writes the migration, one `ALTER TABLE "notifications" DROP COLUMN "digested_at"`.

## Verify

```sh
pnpm generate
pnpm check
pnpm unused
pnpm test
```
