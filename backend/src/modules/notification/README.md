# Notifications

This module turns product writes into an inbox per recipient, with an instant mail for a mention (and for a comment or reply where the app turns those on), a push to a device that has no open stream, and a daily or weekly digest of the rest.

A product module opts in by declaring a notification source on its own module. Mentions come from the row's body; any other recipient comes from the source's recipient rule, the one part an app writes. Without a source the module does nothing.

## Three rules

- **A user hears of a subject once.** The inbox holds at most one row per recipient and subject, so a change delivered again, an edit or a republish tells nobody twice. Everything after the insert follows the rows it wrote: the signal to an open stream, the push and the instant mail.
- **The fan-out mails what it wrote.** Once every row of a change is written, the rows of a mail category go out to recipients with a verified address who keep that category on. A row whose mail went out is stamped, and the digest skips it; a failed send leaves the row to the digest.
- **A digest has one window.** A recipient's window ends when the run starts and is settled right after their mail went out, so a failed send leaves it open for the next hourly run.

A recipient must belong to the row's organization and may read the row when it is written. The inbox and the digest ask again: they list only rows of organizations the recipient still belongs to, the inbox shows a subject the recipient may no longer read with empty names, and the digest leaves it out. The instant mail goes on the decision made at the write.

## Failure modes

Each row names its answers per level ([Sync engine](../../../../cella/SYNC_ENGINE.md#failure-modes)): here the mid level is the inbox's next read or the digest's next run, the lost case the digest mailing what the instant path lost. A mark read holds a second answer at the core: the tab that marked refetches the inbox when the mutation settles and again on its own signal.

| What fails | Core | Mid | Lost case |
| --- | --- | --- | --- |
| A change arrives again, an edit or a republish names a recipient again, or two deliveries of one subject overlap | The insert skips a recipient who holds a row for the subject, under a lock per subject (`insertNotificationsIgnoringDuplicates`) | | |
| One change carries rows of several writers or subjects | Each row is told under its own activity and writer (`fanOutNotifications`) | | |
| A mentioned or resolved user names no user, may not read the row, or is outside the organization of a public row | Left out before the insert (`filterByReadAccess`) | | |
| The recipient leaves the organization afterwards | Every inbox, count and digest read requires the membership (`recipientStillBelongs`) | | |
| The subject is deleted or unpublished, or the recipient may no longer read it | The inbox blanks its names and the digest leaves it out (`findReadableSubjectIds`) | | |
| One row's fan-out throws | Logged and skipped, per row and per change (`fanOutNotifications`) | | |
| The API stops between the insert and the signal, push or mail | | The inbox refetches on focus and after its stale time (`notificationsQueryOptions`) | The digest mails the unmailed row (`runDigest`) |
| A client misses `notification.created` or `notification.read` | | The same refetch of the inbox | |
| The mail service refuses or times out an instant mail | The mailer retries with backoff (`sendEmails`) | | The row stays unstamped and the digest mails it (`runDigest`) |
| The mail service refuses a digest mail, or one recipient's digest throws | The mailer retries with backoff (`sendEmails`) | The window stays open and the next run takes the recipient again (`runDigest`) | |
| The process stops between a digest send and its stamp | | | None: that window is mailed twice |
| A digest run outlives its job's expiry while a second jobs worker runs, as during a deploy | The run takes no recipient past its time budget (`runDigest`) | | |
| A user has no preferences row | The defaults answer (`defaultPreferences`) | | |
| A CDC message names an unknown event type | The API's message schema drops it (`cdcMessageSchema`) | | |
| A mark read fails or diverges from the server | The mutation refetches the inbox when it settles, and `notification.read` refetches it in every tab (`useMarkNotificationsReadMutation`) | | |
| A push endpoint is gone, refused or rate-limited | Gone ones are deleted and a rate limit backs off (`sendNotificationPush`) | | |
| A stored push endpoint names a host off the allowlist | Refused at registration and at send (`isPushServiceEndpoint`) | | |
| A mail scanner or link preview opens an unsubscribe link | The link opens a page that confirms with a POST, and the GET changes nothing | | |
