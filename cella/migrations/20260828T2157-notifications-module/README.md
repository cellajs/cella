# Notifications module: inbox, mentions and email digest

## What & why

New `notifications` module (backend `modules/notification/`, frontend `modules/notification/`):
per-recipient inbox for mentions and addressed activity, per-user email preferences,
category-scoped unsubscribe, daily/weekly digest as a module job. Product modules opt in by
declaring a `notifications` source on `defineBackendModule` (`mentionable`, `loadRows`,
`writeMentions`, `resolveRecipients`, `resolveContextId`, `loadPreview`, `loadContextNames`,
`resolveEmailLink`; see `backend/src/lib/module.ts`); with no source the module is dormant. Phase 1
of `WEB_PUSH_BADGE_PLAN.md`.

## Blast radius

Not sync-breaking (dormant), but every app acts once: `pnpm generate` (`backend/drizzle` is
app-owned) for the new tables
`notifications` (partitioned weekly, 90-day retention like `seen_by`) and
`notification_preferences`, verifying the partitions exist in the DB (do not trust exit codes),
and the bell (`BellIcon`, `NotificationsSheet`, `UnreadNavBadge`) in the pinned `nav-config.tsx`,
which does not sync. No new env beyond `UNSUBSCRIBE_SECRET`; the SDK gains `/notifications`
routes. Pre-cella forks (projectcampus): steps 3 to 5.

## Run

No script: manual.

## Manual steps

1. Sync, `pnpm generate`, migrate, verify the `notifications` partitions exist.
2. Add the bell to your pinned `nav-config.tsx` (copy cella's entry).
3. Declare a source on each relevant product module:
   `notifications: { mentionable: true, loadRows, writeMentions, resolveRecipients, ... }`;
   `resolveRecipients` carries your thread/assignee model, the rest is common code.
4. Pre-cella forks: delete your copy, move recipient logic into step 3's declarations, rename
   stored `item_id` usage to `context_id` (a fresh `pnpm generate` covers pre-production databases).
5. Mentions need a `mentions` column on the product table and a composer emitting
   `data-mention-id` spans (cella's mention element already does).

## Verify

```sh
pnpm check
pnpm test:core
# dev session: mention flow end to end with a mentionable source; without one, the bell shows an empty inbox and the digest job logs an empty run
```
