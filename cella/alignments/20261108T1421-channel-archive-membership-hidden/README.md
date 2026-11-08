---
breaking: true
clientCacheBump: true
caughtBy: nothing
grep: excludeArchived, isChannelArchivable, getArchiveMoveOrder, archivable, membership.archived, c:restore, c:archive_for_me, c:show_archived, buildChannelListReadWhere, dangerToolBase
generate: true
---

# A member hides a channel, and a channel can be archived

`memberships.archived` is `hidden`: the member's own menu state, in the table, `MembershipBase`, the update body, the
`excludeHidden` list filter, the menu option `hideable`, `isChannelHideable` and `getHideMoveOrder`. The word archive
now names a state of the channel row: `archived` on every channel table and `ChannelBase`, set through
`POST /channels/~archive` and `~unarchive` in the entities module, refused ahead of the engine by `assertNotArchived`
from the organization's archived ids `orgGuard` provides. An app passes its `archived` column and `includeArchived`
to `buildChannelListReadWhere`, places `ArchiveToolCard` in each channel's settings tools with its own
`descendantsDefault`, and generates one migration with `hints.json`.

## What & why

A channel below the organization can now be archived: closed to every write, kept and readable, listed on request.
The personal state a member set from the menu had taken the word, so it is `hidden` in the database, the API and the
interface, with eye icons and the keys `c:hide`, `c:show`, `c:hidden`, `c:hide_for_me`, `c:show_hidden`,
`c:drop_to_hide`, `c:drop_to_show`, `c:success.hide_resource` and `c:success.show_resource`. `c:archived` stays, for
the tenant status and now the channel state.

## Blast radius

Every app: `backend/drizzle` is app-owned, the membership field is on the wire (`clientCacheVersion` moves), and
every channel list query and settings page has a line to add. An app whose channels never need archiving still
renames the membership field and adds the column, and may leave the card out. No lens.

## Run

No script: manual. The typecheck finds the renamed exports; the grep list above finds the rest.

## Manual steps

1. Generate the migration with the hints of `hints.json`: `cd backend && pnpm tsx scripts/generate.ts --name channel_archive --hints '<hints.json as one line>'`. It renames the membership column, recreates the `memberships_<channel>_user_hidden_idx` indexes, moves the membership writer foreign keys from `users` to `actors` and adds `archived` to every channel table.
2. Rename what the typecheck flags: `excludeArchived` to `excludeHidden` in list schemas, operations and frontend query options; `isChannelArchivable` to `isChannelHideable`; `getArchiveMoveOrder` to `getHideMoveOrder`; `membership.archived` to `membership.hidden`; a menu section's `archivable: false` to `hideable: false` in `shared/config/config.default.ts`.
3. Replace the translation keys of the grep list in app code and in `app.json` overrides; `c:restore` is `c:show`. The dynamic keys `c:drop_to_${action}` and `c:success.${action}_resource` take `hide` and `show`.
4. In each channel list query that calls `buildChannelListReadWhere`, pass `archived: <table>.archived` in the columns and the query's `includeArchived`, and add `includeArchived` to the list query schema; the menu's list queries set it, so the Archived group fills, and a table's filter sets it on request.
5. In each channel's settings tools, place `ArchiveToolCard` above the delete card with the app's `descendantsDefault` (`on` for a channel whose children end with it, such as a course; `off` or `hidden` otherwise), and gate the page's update controls with the archive-aware `useCan`.
6. Where app code builds a `useCan` or a route gate for the settings page of a channel, use `useCan({ ignoreArchive: true })`, so an archived channel's settings stay reachable to unarchive it.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
cd backend && pnpm exec cross-env TEST_MODE=core vitest run tests/security/membership-update.test.ts tests/channel-discovery.test.ts
```

Then, in the running app: hide a channel from the menu and show it again; archive a channel with its descendants, check that a product in it refuses an edit and that a member can still leave, and unarchive it.
