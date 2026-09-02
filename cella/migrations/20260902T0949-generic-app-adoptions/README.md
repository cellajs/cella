# Generic app improvements adopted upstream

## What & why

Small generalisations both apps carried as `// fork:` deltas on cella-owned files, now in cella so
their copies converge to identical:

- `tenantReadAs(ctx, tenantId, fn)` in `backend/src/db/tenant-context.ts`: `tenantRead` with an
  explicit tenant id for cross-tenant routes.
- `resolveEmailLink` on the backend module notification source now receives `tenantId`,
  `channelId` and `entityType` besides `subjectId` and `contextId`.
- `getCreatedChannelRoute(entityType, channel)` and `getNearestAncestorRoute(entityType, row)` in
  `frontend/src/utils/channel-route.ts`; the latter walks `hierarchy.getOrderedAncestors` for the
  deepest non-null ancestor id column.
- `recalculate-counters.ts` compares embedded host ids as text on both sides, so `uuid[]` host
  arrays work.
- The tab arrangement card headers its name column with `c:resource_name` (`{{resource}} name`,
  new key in `locales/en|nl/common.json`) and `c:tab`.
- `frontend/.../derive-description-props.ts` uses `shared/utils/derive-description-core` (cella had
  shipped the core but its own frontend still inlined the walk). `DerivedDescriptionCounts` now also
  carries `attachments: string[]`, the referenced attachment ids.
- `shared/app-exports.ts` (pinned, empty in cella) is re-exported from `shared/index.ts`: app-owned
  constants under `shared/config/*` reach consumers through the `shared` import without editing the
  synced barrel.
- `appConfig.memberStatProductTypes` (`['attachment']`) drives the members table stats:
  `member-counts.ts` resolves tables through `entityTables`, counts only published rows where the
  table has `publishedAt`, and stamps activity by publish time there; `members-columns.tsx` reads the
  same config. The first type is the `lastPostedAt` sort key.
- `channelRouteConfig` entries accept `notificationSearch(notification)`, the search params a
  notification link opens with (a product's sheet id, for instance); `getNotificationRoute` passes
  `entityType` and `subjectId` through.

## Blast radius

Sync-breaking only through the new `shared/app-exports.ts` import in `shared/index.ts` and the
new `memberStatProductTypes` config key: `pnpm check` fails until both exist in the app. Everything
else is additive; fork copies of these files merge clean or conflict trivially (take upstream and
re-apply what is genuinely app-specific).

## Run

No script — manual.

## Manual steps

1. `shared/config/config.default.ts`: add `memberStatProductTypes` (the product types the members
   table shows stats for; `['attachment']` keeps today's behavior).
2. Create `shared/app-exports.ts` and move app-owned re-exports out of `shared/index.ts` into it
   (raak: the label vocabulary exports). Add it to `pinned` in `cella/cella.config.ts`.
3. Take upstream for `tenant-context.ts`, `lib/module.ts`, `channel-route.ts`,
   `recalculate-counters.ts`, `tabs-arrangement-card.tsx`, `derive-description-props.ts` (+ test),
   `member-counts.ts`, `members-columns.tsx`, `notification-link.ts`. Keep app-only icons in
   `members-columns.tsx` under a fork marker.
4. Apps that special-cased notification links per entity type move that rule into the channel's
   `notificationSearch` in the pinned `routes-config.tsx`.
5. Apps whose derived description props must not carry `attachmentCount` on the wire strip it at
   the mutation call site instead of narrowing the shared type.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test:core
```

`grep -rn "fork:" backend frontend shared` should no longer list any of the files above.
