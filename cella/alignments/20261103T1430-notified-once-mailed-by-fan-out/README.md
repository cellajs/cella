---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: fanOutNotifications, sendPendingInstantEmails, findPendingInstantEmails, findNotifiedUserIds, insertNotificationsIgnoringDuplicates, notifications_user_activity_index, isValidEventType
generate: true
---

# A user hears of a subject once, and the fan-out mails the rows it wrote

`fanOutNotifications` resolves to nothing: its boolean and `sendPendingInstantEmails` with the organization-wide `findPendingInstantEmails` scan are gone, and the fan-out mails the rows its insert returned through `sendInstantEmails(rows)`. `insertNotificationsIgnoringDuplicates` keys on user and subject for every action, under a lock per subject, and returns the rows written; `findNotifiedUserIds` is removed. The inbox, the unread count and the digest read plain rows, and `pnpm generate` drops `notifications_user_activity_index`. `isValidEventType` leaves `shared`.

## What & why

Four mechanisms answered "a user hears of a row once", and the mail scan decided again what the fan-out had just decided. Two overlapping writes in one organization mailed a row twice, turning a mail category on mailed up to 200 old rows, and a redelivery signalled and pushed everyone again. A recipient must now belong to the subject's organization, so a public row's mention of an outsider writes nothing.

## Blast radius

App tests that read the fan-out's boolean or call the scan. One migration drops an index. A republished row no longer tells users told before, and a failed instant mail is left to the digest. Comment threads in apps with `has.commentEmail` stop mailing twice. No lens or cache change.

## Run

No script: manual.

## Manual steps

1. raak `backend/tests/task-mention-notifications.test.ts` (lines 138 and 146): await `fanOutNotifications(updatedEvent())` without `expect(...).toBe(true)` or `.toBe(false)`; the `inboxOf` rows asserted next are what the test checks now.
2. An app test that wrote notification rows by hand and called `sendPendingInstantEmails(organizationId)` drives the fan-out with a product event instead, as `backend/tests/attachment-notifications.test.ts` does.
3. Run `pnpm generate`: it alone writes the migration, one `DROP INDEX "notifications_user_activity_index"`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test
```
