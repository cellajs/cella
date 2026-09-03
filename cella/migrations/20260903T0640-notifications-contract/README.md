# Notifications contract: attachment mentions, app types, deriveFrom, server BlockNote schema

## What & why

Attachments are the template's notification source: `attachments.mentions` (text[]), `description`
on the update contract, `updateAttachmentOp` as the Yjs materializer, a collaborative description
editor (`attachment-description-sheet.tsx`, table cell and dialog caption), so `pnpm test:core`
exercises mention derivation, fan-out and instant email on every merge. Contract changes raak hit:
`appNotificationTypes` in the pinned `app-schemas.ts` extends the type enum and label keys;
`ModuleNotifications.deriveFrom` (`client` | `materialized` | `both`) replaces the hardcoded
`serverOrigin` skip; `shared/utils/blocknote-server-schema.ts` is the one server schema (Yjs relay
and `#/lib/blocknote-server` `blocksToHtml`); `pnpm style` reads
`shared/config/vocabulary-allowlist.ts`.

## Blast radius

Sync-breaking only for apps that customized `app-schemas.ts` or the attachment module. DB:
`attachments.mentions`. Wire: `Attachment` gains `mentions`, its update ops gain `description`
(additive, no `clientCacheVersion` bump). Locale keys: `email.digest_line.*` and
`email.unsubscribe_mentions` added.

## Run

No script: manual.

## Manual steps

1. Append the template's `appNotificationTypes` export to your pinned `app-schemas.ts`; list your
   types (e.g. `['assigned']`) and add `notification.<type>` plus `email.digest_line.<type>` to
   `app.json`.
2. On sources whose Yjs document owns the body, set `deriveFrom: 'materialized'` (or `'both'`) and
   delete any `onMutation` handler that re-dispatched server-origin writes with `serverOrigin: false`.
3. Take upstream for the attachment module (backend and frontend) and `pnpm generate` for
   `attachments.mentions`; if attachments are re-homed below the organization, `resolveEmailLink`
   in `attachment-notifications.ts` needs your channel route.
4. Create `shared/config/vocabulary-allowlist.ts` from the template and move app-side exceptions
   (e.g. `json/lucide-icon-names.json`) into it; take upstream for `check-app-vocabulary.ts`.
5. Replace backend `ServerBlockNoteEditor` conversions and mention-flattening workarounds with
   `blocksToHtml` from `#/lib/blocknote-server`; take upstream for `yjs/src/lib/blocknote-seed.ts`.

## Verify

```sh
pnpm generate
pnpm check
pnpm test:core
pnpm style
```
