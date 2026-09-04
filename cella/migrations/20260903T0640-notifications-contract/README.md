# Notifications contract: table-derived sources, attachment mentions, /n deep link

## What & why

A notification source is derived from the product table: `notifications: true` on
`defineBackendModule` gives live-row loading (`deletedAt`, `publishedAt`), `mentions` writing when
the table has `mentionableColumns`, previews and digest names from `name` and `description`, and
`deriveFrom: 'both'` when the module registers a `yjsMaterializer`; apps override only
`resolveRecipients` and `resolveContextId`. Email and push links are self-describing (`/n?...`,
`buildNotificationLink`, frontend `notification-link.ts`), so `resolveEmailLink` is gone.
Attachments are the template consumer: `attachments.mentions`, `description` on the update
contract, `updateAttachmentOp` as materializer, a collaborative description editor in a sheet
(`useDescriptionUpdate` is the shared persistence policy). `appNotificationTypes` in the pinned
`app-schemas.ts` extends the type enum and labels; `shared/utils/blocknote-server-schema.ts` is
the one server schema; `pnpm style` reads `shared/config/vocabulary-allowlist.ts`.

The inbox card reads like the pre-cella app's: `getNotifications` items carry `actor`, `channelName`
and `subjectTitle`, and `c:notification.<type>` sentences interpolate them. `channelRouteConfig`
entries declare `notificationSearch` so a link opens the subject (cella: `attachmentDialogId`); a
channel without it lands on its default tab. `pnpm seed` gains a notifications seed built on
`mockSeedNotification` (`notification-mocks.ts`).

## Blast radius

Sync-breaking for apps with a `notifications` source (`loadRows` and `resolveEmailLink` change
shape), a `*DescriptionUpdate` hook, or a customized `app-schemas.ts`. DB: `attachments.mentions`.
Wire: `Attachment.mentions`, `description` update op, push payload `url` (additive, no
`clientCacheVersion` bump). Locale keys added: `email.digest_line.*`, `email.unsubscribe_mentions`.

## Run

No script: manual.

## Manual steps

1. Delete per-product `*-notifications.ts` files; declare `notifications: true` on the module, or
   `{ resolveRecipients, resolveContextId }` for thread and assignee models. Replace the
   `mentions` column line in each product table with `...mentionableColumns`. Remove
   `resolveEmailLink` and any `onMutation` handler that re-dispatched server-origin writes.
2. Append the template's `appNotificationTypes` export to your pinned `app-schemas.ts`; list your
   types (e.g. `['assigned']`) and add `notification.<type>` plus `email.digest_line.<type>` to
   `app.json`.
3. Replace `use-<product>-description-update.ts` hooks with `useDescriptionUpdate` from
   `modules/common/blocknote`, or compose its halves (`patchCollaborativeDescription` with your
   derived fields, `persistStandaloneDescription` behind a debounce) when the editor needs more.
4. Take upstream for the attachment module (backend and frontend), `pnpm generate` for
   `attachments.mentions`, and for `frontend/src/lib/sw.ts` (push clicks open the subject).
5. Create `shared/config/vocabulary-allowlist.ts` from the template and move app-side exceptions
   into it; take upstream for `check-app-vocabulary.ts`.
6. Create backend `ServerBlockNoteEditor` instances with `serverBlockNoteSchema` from
   `shared/utils/blocknote-server-schema` and delete mention-flattening workarounds; take
   upstream for `yjs/src/lib/blocknote-seed.ts`.

7. Give every channel in `channelRouteConfig` a `notificationSearch` mapping your subject types to
   the search param that opens them (projectcampus: item and comment ids on the feed); without it
   a notification lands on the channel's default tab, which is why item links opened the
   organization's courses tab. Rewrite your `notification.<type>` keys as sentences with `actor`,
   `subject` and `channel`, and add `someone` to `app.json` if you override it.
8. Port your notifications seed onto `mockSeedNotification` (projectcampus's `55-notifications.seed.ts`).

## Verify

```sh
pnpm generate
pnpm check
pnpm test:core
pnpm style
```
