# Notifications

This module turns product writes into an inbox per recipient, with an instant mail for a mention (and for a comment or reply where the app turns those on), a push to a device that has no open stream, and a daily or weekly digest of the rest.

A product module opts in by declaring a notification source on its own module. Mentions come from the row's body; any other recipient comes from the source's recipient rule, the one part an app writes. Without a source the module does nothing.

## Three rules

- **A user hears of a subject once.** The inbox holds at most one row per recipient and subject, so a change delivered again, an edit or a republish tells nobody twice. Everything after the insert follows the rows it wrote: the signal to an open stream, the push and the instant mail.
- **The fan-out mails what it wrote.** Once every row of a change is written, the rows of a mail category go out to recipients with a verified address who keep that category on. A row is stamped right after its mail went out, and the digest skips it; a failed send leaves the row to the digest, when the recipient has one.
- **A digest has one window.** A recipient's window ends when the run starts and is settled right after their mail went out, so a failed send leaves it open for the next hourly run. A row whose write commits while a run reads can fall in neither window.

A recipient must belong to the row's organization, or be a system admin, and may read the row when it is written. The inbox and the digest ask again: they list only rows of organizations the recipient still belongs to, the inbox shows a subject the recipient may no longer read with empty names, keeping only the organization's, and the digest leaves it out. The instant mail goes on the decision made at the write.

## Failure modes

Each row names its answers per level ([Sync engine](../../../../cella/SYNC_ENGINE.md#failure-modes)): here the mid level is the inbox's next read or the digest's next run, the lost case the digest mailing what the instant path lost, which a recipient with the digest off goes without. A mark read holds a second answer at the core, an open finding: the tab that marked refetches the inbox when the mutation settles and again on its own signal.

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A change arrives again, an edit or a republish names a recipient again, or two deliveries of one subject overlap | The insert skips a recipient who holds a row for the subject, under a lock per subject (`insertNotificationsIgnoringDuplicates`) | | |
| One change carries rows of several writers or subjects | Each row is told under its own activity and writer (`fanOutNotifications`) | | |
| A mentioned or resolved user names no user, may not read the row, or is outside the organization of a public row | Left out before the insert (`filterByReadAccess`) | | |
| The recipient leaves the organization afterwards | Every inbox, count and digest read requires the membership or a system admin role (`recipientStillBelongs`) | | |
| The recipient's organization is in an archived tenant | The digest leaves its rows out (`findReadableSubjectIds`) | | None for the inbox: the membership rows stay, so its rows stay listed and counted unread, with empty names (`recipientStillBelongs`) |
| The subject is deleted or unpublished, or the recipient may no longer read it | The inbox blanks its names and the digest leaves it out (`findReadableSubjectIds`) | | |
| One row's fan-out throws | Logged and skipped, per row and per change (`fanOutNotifications`) | | |
| The API stops after the worker's message reached it and before the fan-out wrote | | | None: no inbox row, mail or digest line (`fanOutNotifications`) |
| The API stops between the insert and the signal, push or mail | | The inbox refetches on window focus once stale, and when the device is back online (`notificationsQueryOptions`) | The digest mails the unmailed row (`runDigest`); none with the digest off |
| A client misses `notification.created` or `notification.read` | | The same refetch of the inbox | |
| The mail service refuses or times out an instant mail | The mailer retries with backoff (`sendEmails`) | | The row stays unstamped and the digest mails it (`runDigest`); none with the digest off |
| The process stops between an instant mail and its stamp, or the stamp fails | | | None: the digest mails that row again (`sendInstantEmails`) |
| The mail service refuses a digest mail, or one recipient's digest throws | The mailer retries with backoff (`sendEmails`) | The window stays open and the next run takes the recipient again (`runDigest`) | |
| The process stops between a digest send and its stamp | | | None: that window is mailed twice |
| A row's write commits while a digest run reads | | | None: it can fall in neither window (`runDigest`) |
| A digest run outlives its job's expiry while a second jobs worker runs, as during a deploy | The run takes no recipient past its time budget (`runDigest`) | | |
| A user has no preferences row | The defaults answer (`defaultPreferences`) | | |
| A CDC message names an unknown event type | The API's message schema drops it (`cdcMessageSchema`) | | |
| A mark read fails or diverges from the server | The mutation refetches the inbox when it settles (`useMarkNotificationsReadMutation`), and `notification.read` refetches it in every other tab. Open finding, a second answer in the tab that marked: its own `notification.read` refetches it again | | |
| A push endpoint is gone, refused or rate-limited | Gone ones are deleted; a push service that rate-limits gets no more of that notification's pushes, and none until its `Retry-After` ends, while the others go on (`sendNotificationPush`) | | |
| A stored push endpoint names a host off the allowlist | Refused at registration and at send (`isPushServiceEndpoint`) | | |
| Another user registers a push endpoint they learned | Refused unless the post carries the subscription's auth secret, which only the browser holding it has (`upsertPushSubscription`) | | |
| A mail scanner or link preview opens an unsubscribe link | The link opens a page that confirms with a POST, and the GET changes nothing (`UnsubscribePage`, `setEmailCategoryOp`) | | |

## Files

- [notification-module.ts](./notification-module.ts): registers the routes, the two signals and the hourly digest job.
- [notification-db.ts](./notification-db.ts): the inbox table, partitioned by creation time, and the preferences table with its defaults.
- [notification-types.ts](./notification-types.ts): the template's and the app's notification types, and which of them mail at once.
- [notification-sources.ts](./notification-sources.ts): the sources product modules declare, and the reads of their subject rows and context names.
- [notification-listeners.ts](./notification-listeners.ts): runs the fan-out for each product create and update on the activity bus.
- [notification-queries.ts](./notification-queries.ts): the reads and writes of both tables, with the membership check every read applies.
- [notification-schema.ts](./notification-schema.ts): the inbox, mark-read and preferences shapes on the wire.
- [notification-routes.ts](./notification-routes.ts): the inbox, mark-read, preferences and unsubscribe routes.
- [notification-handlers.ts](./notification-handlers.ts): the handlers of those routes.
- [notification-mocks.ts](./notification-mocks.ts): seeded inbox rows, stamped as mailed so no digest sends them.
- [notification-seed-subjects.ts](./notification-seed-subjects.ts): the products the seed mentions the admin in (app-owned).
- [operations/fan-out.ts](./operations/fan-out.ts): turns one change into inbox rows, signals and pushes, then hands the rows to the instant mail.
- [operations/send-instant-emails.ts](./operations/send-instant-emails.ts): mails the rows of a mail category and stamps each row sent.
- [operations/run-digest.ts](./operations/run-digest.ts): the hourly digest pass over the recipients who are due.
- [operations/build-digest.ts](./operations/build-digest.ts): one recipient's digest sections for their window.
- [operations/readable-subjects.ts](./operations/readable-subjects.ts): the subjects a recipient may still read, asked by the inbox and the digest.
- [operations/get-notifications.ts](./operations/get-notifications.ts): an inbox page with its unread count and the names its cards show.
- [operations/mark-read.ts](./operations/mark-read.ts): marks the caller's own rows read.
- [operations/preferences.ts](./operations/preferences.ts): reads and updates the caller's mail and digest preferences.
- [operations/unsubscribe.ts](./operations/unsubscribe.ts): turns one mail category off or back on from a mailed link.
- [emails/mention-email.tsx](./emails/mention-email.tsx): the instant mail of a mention.
- [emails/comment-email.tsx](./emails/comment-email.tsx): the instant mail of a comment or reply, where the app offers it.
- [emails/subject-email.tsx](./emails/subject-email.tsx): the body both instant mails share.
- [emails/digest-email.tsx](./emails/digest-email.tsx): the daily or weekly digest mail.
- [helpers/category-token.ts](./helpers/category-token.ts): the signed token of an unsubscribe link.
- [helpers/render-digest-html.ts](./helpers/render-digest-html.ts): the digest sections as escaped HTML, and the excerpt of a stored body.
