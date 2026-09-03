# Notifications contract: app types, deriveFrom, dispatch, server BlockNote schema

## What & why

The notification vocabulary opens to apps: `appNotificationTypes` in the pinned
`backend/src/schemas/app-schemas.ts` (`{ email, muted }` per type) merges into
`notificationTypePolicies` (`modules/notification/notification-types.ts`), which now derives the
column enum, one `<type>Email` preference column per type, the unsubscribe categories, the instant
email path (`notification-email.tsx`, `findPendingInstantEmails`) and the frontend labels. The
template adds `edit`. `ModuleNotifications.deriveFrom` (`client` | `materialized` | `both`) replaces
the hardcoded `serverOrigin` skip in mention derivation. The attachment module is the template's
notification source and its ops dispatch `attachment.created` / `attachment.updated`.
`shared/utils/blocknote-server-schema.ts` is the one server schema (Yjs relay and
`#/lib/blocknote-server` `blocksToHtml`). `pnpm style` reads `shared/config/vocabulary-allowlist.ts`.

## Blast radius

Sync-breaking for apps with a `notifications` source or a customized `app-schemas.ts`; others only
add two exports and run `pnpm generate`. DB: `notification_preferences` gains `reply_email`,
`edit_email` and one column per app type. Wire: preferences gain fields, the unsubscribe category
enum widens (additive, no `clientCacheVersion` bump). Locale keys `email.mention.button` and
`email.mention.in` are replaced by `email.notification.*`.

## Run

No script: manual.

## Manual steps

1. Append the template's `appNotificationTypes` export to your pinned `app-schemas.ts` and declare
   your types (e.g. `assigned: { email: true, muted: false }`); add `notification.<type>` and
   `notifications.<type>_email` to `app.json`, plus `email.<type>.subject|preview|title` and
   `email.digest_line.<type>` when the generic copy does not fit; run `pnpm generate`.
2. On sources whose Yjs document owns the body, set `deriveFrom: 'materialized'` (or `'both'`) and
   delete any `onMutation` handler that re-dispatched server-origin writes with `serverOrigin: false`.
3. Confirm every source module's create and update ops call `dispatchMutation(txCtx,
   '<type>.created' | '<type>.updated', { before, after })` inside the write transaction; copy the
   attachment ops' shape otherwise.
4. Create `shared/config/vocabulary-allowlist.ts` from the template and move app-side exceptions
   (e.g. `json/lucide-icon-names.json`) into it; take upstream for `check-app-vocabulary.ts`.
5. Replace backend `ServerBlockNoteEditor` conversions and mention-flattening workarounds with
   `blocksToHtml` from `#/lib/blocknote-server`; take upstream for `yjs/src/lib/blocknote-seed.ts`.
6. Take upstream for the notification module, `notifications-sheet.tsx` and
   `account-notifications-card.tsx`; rename any import of `mentionEmail` / `findPendingMentionEmails`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test:core
pnpm style
```
