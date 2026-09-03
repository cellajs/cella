# Generic app improvements adopted upstream

## What & why

Fork `// fork:` deltas on cella-owned files, now upstream:

- `tenantReadAs(ctx, tenantId, fn)` in `backend/src/db/tenant-context.ts`: `tenantRead` with an
  explicit tenant id.
- `resolveEmailLink` (notification source) also receives `tenantId`, `channelId`, `entityType`.
- `getCreatedChannelRoute(entityType, channel)` and `getNearestAncestorRoute(entityType, row)` in
  `frontend/src/utils/channel-route.ts`.
- `recalculate-counters.ts` compares embedded host ids as text (`uuid[]` hosts work).
- Tab arrangement card headers: `c:resource_name` (`{{resource}} name`, new key in
  `locales/en|nl/common.json`) and `c:tab`.
- `frontend/.../derive-description-props.ts` uses `shared/utils/derive-description-core`;
  `DerivedDescriptionCounts` gains `attachments: string[]`.
- `shared/package.json` exports `./config/*`: app-owned `shared/config/` modules import as
  `shared/config/<file>`, not via the synced barrel.
- `appConfig.memberStatProductTypes` (`['attachment']`) drives member stats: `member-counts.ts`
  resolves tables through `entityTables`, counts only published rows where the table has
  `publishedAt` and stamps activity by publish time there; `members-columns.tsx` reads it; the
  first type is the `lastPostedAt` sort key.
- `channelRouteConfig.notificationSearch(notification)`: search params a notification link opens
  with; `getNotificationRoute` passes `entityType` and `subjectId`.

## Blast radius

Sync-breaking only through the new `memberStatProductTypes` key: `pnpm check` fails until it
exists. `package.json` never syncs, so the `./config/*` export is manual. Everything else is
additive; on conflict take upstream and re-apply what is app-specific.

## Run

No script: manual.

## Manual steps

1. `shared/config/config.default.ts`: add `memberStatProductTypes` (`['attachment']` keeps today's
   behavior).
2. Add `"./config/*": "./config/*.ts"` to `exports` in `shared/package.json`, import app-owned
   config modules as `shared/config/<file>`, take upstream's `shared/index.ts` verbatim (raak: the
   label vocabulary exports).
3. Take upstream for `tenant-context.ts`, `lib/module.ts`, `channel-route.ts`,
   `recalculate-counters.ts`, `tabs-arrangement-card.tsx`, `derive-description-props.ts` (+ test),
   `member-counts.ts`, `members-columns.tsx`, `notification-link.ts`; keep app-only icons in
   `members-columns.tsx` under a fork marker.
4. Move per-entity-type notification link rules into the channel's `notificationSearch` in the
   pinned `routes-config.tsx`.
5. Apps that must not send `attachmentCount` in derived description props strip it at the mutation
   call site, not by narrowing the shared type.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test:core
grep -rn "fork:" backend frontend shared   # should list none of the files above
```
