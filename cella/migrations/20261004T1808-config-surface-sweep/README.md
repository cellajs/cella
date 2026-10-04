---
syncBreaking: true
clientCacheBump: false
---

# The -config suffix marks an app-owned file: five renames, two deleted maps and marketing copy pinned

`menu-config.tsx` and `members-config.ts` are gone: the module owning an entity declares `channel` or `product` in
`defineFrontendModule`, and `~/lib/entity-modules` reads it back. `list-queries-config.tsx` keeps `buildEntitySyncQueries`
alone as `entity-sync-queries.ts`. `nav-config.tsx` moves to `modules/navigation/nav-items.tsx`, and
`sync-stale-config.ts`, `blocknote-config.ts`, `onboarding-config.ts` and `page-tree-config.ts` are renamed for what they
hold. `marketing-config.tsx` becomes pinned. An app moves its own entries and updates three paths in `cella.config.ts`.

## What & why

Thirteen `frontend/src` files carried `-config`; five were template internals identical in every app, and
`marketing-config.tsx` held app marketing copy while syncing on every pull. A channel's menu section, list query and
members-table defaults now sit with the entity, in `channel` / `product` on its `defineFrontendModule` call, read via
`getMenuSection`, `getChannelListQuery`, `getChannelListQueries`, `getMemberStatIcon` and `isMemberCountHidden`.
`channelRouteConfig` stays central: the router types `to` from its literal `path` strings.

## Blast radius

Every app: `menu-config.tsx` and `members-config.ts` are pinned files that no longer exist upstream, and five renamed
paths break imports until step 2. Typecheck names each one. No database change, no `clientCacheVersion` bump, no wire
or SDK change.

## Run

No script: manual.

## Manual steps

1. `cella/cella.config.ts`: drop `'frontend/src/members-config.ts'` and `'frontend/src/menu-config.tsx'` from `pinned`, rename `'frontend/src/list-queries-config.tsx'` to `'frontend/src/entity-sync-queries.ts'`, and add `'frontend/src/modules/marketing/marketing-config.tsx'`.
2. `git mv` the five renamed files and rewrite their import specifiers: `~/nav-config` to `~/modules/navigation/nav-items`, `~/query/basic/sync-stale-config` to `~/query/basic/sync-stale-state`, `~/modules/common/blocknote/blocknote-config` to `~/modules/common/blocknote/blocknote-schema`, `~/modules/home/onboarding/onboarding-config` to `~/modules/home/onboarding/onboarding-steps`, `~/modules/page/table/page-tree-config` to `~/modules/page/table/page-tree`.
3. `defaultFooterLinks` moved into `modules/common/app/app-footer.tsx`; an app with its own set edits it there and drops it from the moved nav file.
4. Each channel: move its `menuSectionsSchema` entry into `channel.menuSection` on its `<name>-module.tsx` (without the `entityType` key, which `channel.entityType` carries) and its `channelListQueriesByType` entry into `channel.listQuery`, keeping the arrow wrapper. Copy [organization-module.tsx](../../../frontend/src/modules/organization/organization-module.tsx).
5. Each product with a `memberStatIcons` entry: move the icon into `product.memberStatIcon` on its `<name>-module.ts`. Each entry in `hiddenMemberCountColumns` becomes `hiddenMemberCount: true` on that entity's `channel` or `product`.
6. Delete `frontend/src/menu-config.tsx` and `frontend/src/members-config.ts`, and `git mv frontend/src/list-queries-config.tsx frontend/src/entity-sync-queries.ts` keeping only `buildEntitySyncQueries`.
7. Replace the reads: `menuSectionsSchema[t]` with `getMenuSection(t)`, `channelListQueriesByType[t]` with `getChannelListQuery(t)`, `Object.entries(channelListQueriesByType)` with `Object.entries(getChannelListQueries())`, `memberStatIcons[t]` with `getMemberStatIcon(t)`, `hiddenMemberCountColumns.includes(t)` with `isMemberCountHidden(t)` (all from `~/lib/entity-modules`).
8. `marketing-config.tsx` is pinned from here on: `pnpm cella analyze` reports it as protected and behind upstream, and structural changes to it are adopted by hand.

## Verify

```sh
pnpm cella analyze   # members-config.ts and menu-config.tsx gone from the protected list
pnpm check
```
