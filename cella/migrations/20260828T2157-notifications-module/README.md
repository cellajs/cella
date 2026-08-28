# Notifications module: inbox, mentions and email digest

## What & why

Cella gains a `notifications` module (backend `modules/notification/`, frontend
`modules/notification/`): a per-recipient inbox for mentions and addressed activity, per-user
email preferences, category-scoped unsubscribe, and a daily/weekly email digest running as a
module job. The only app-specific part is who counts as a recipient, so product modules opt in by
declaring a `notifications` source on their own `defineBackendModule` call (`mentionable`,
`loadRows`, `writeMentions`, `resolveRecipients`, `resolveContextId`, `loadPreview`,
`loadContextNames`, `resolveEmailLink` — see `backend/src/lib/module.ts`). With no source
declared the module is dormant: no rows, no emails, an empty inbox behind the new nav bell.
This is phase 1 of `WEB_PUSH_BADGE_PLAN.md`; the unread count is the future PWA app-badge and
Web Push source.

## Blast radius

Not sync-breaking for an app that never built notifications: the module arrives dormant and
`pnpm check` stays green. Every app must still act once:

- **Database**: two new tables (`notifications`, partitioned weekly with 90-day retention like
  `seen_by`; `notification_preferences`). `backend/drizzle` is app-owned, so run `pnpm generate`
  after the sync to emit your own migration, and verify the partitions exist in the DB (the
  side-effect migration reports them; do not trust exit codes alone).
- **Pinned `nav-config.tsx`** does not sync: add the bell yourself (icon `BellIcon`, sheet
  `NotificationsSheet`, badge `UnreadNavBadge`) or skip it to keep the inbox unreachable.
- New env usage: none beyond the existing `UNSUBSCRIBE_SECRET`.
- SDK regenerates with the `/notifications` routes.

An app that already forked its own notifications (projectcampus) reconciles onto the cella
module; see manual steps 3–5.

## Run

No script — manual. Source declarations are app decisions.

## Manual steps

1. Sync, run `pnpm generate`, apply migrations, and verify the `notifications` partitions exist.
2. Add the bell to your pinned `nav-config.tsx` (three lines; copy cella's template entry).
3. To produce notifications, declare a source on each relevant product module:
   `notifications: { mentionable: true, loadRows, writeMentions, resolveRecipients, ... }`.
   `resolveRecipients` carries your thread/assignee model; mention derivation, permission and
   mute filtering, dedupe, instant email and digest are common code.
4. Apps with a pre-cella fork of the module: delete your fork's copy in favor of the synced one,
   move your recipient logic into the declarations of step 3, and rename any stored `item_id`
   usage to `context_id` (the generic grouping/deep-link column; a fresh `pnpm generate` covers
   pre-production databases).
5. Mentions require the product table to carry a `mentions` column and the composer to emit
   `data-mention-id` spans (cella's mention element already does).

## Verify

```sh
pnpm check
pnpm test:core
```

Then in a dev session: mention flow end to end if you declared a mentionable source, or with no
sources simply confirm the bell renders an empty inbox and the digest job logs an empty run.
