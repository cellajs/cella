---
syncBreaking: true
clientCacheBump: false
---

# One ordered list per surface: appConfig.surfaces replaces placement-config.ts and defaultTabId

`frontend/src/placement-config.ts` is gone, and with it `PlacementOverride`, `PlacementOverrides` and the
`defaultTabId` field of `channelRouteConfig`. An app now lists the placement ids it wants per surface, in
display order, in `appConfig.surfaces`: a listed surface is total, so an id left out has no placement
there, and the first id of a tab bar is the tab a channel link lands on. `Slot` and `ChannelSlot` move to
`shared/placements`, so `toolsConfig` is keyed by this app's channel slots and validated at the wire.

## What & why

Arranging one tab bar took three mechanisms: `order` on a route's `navTab`, `defaultTabId` in
`routes-config.tsx`, and `{ hidden: true }` in `placement-config.ts`, whose host key could be a slot id
or a route id and whose own doc example used a route id that matched nothing. One ordered list answers
all three. `isPlacementHidden` and `resolvePlacementList` now take a `Slot`, `getTabsHost` is gone, and
`assertSurfaces()` throws at startup for an id that names no placement of its surface.

## Blast radius

Every app with a non-empty `placementOverrides`, a `defaultTabId`, or an app-set `navTab.order`.
Typecheck names each one: the deleted file, the dropped `defaultTabId`, and the `host: string` parameter
that is now `Slot`. No database change, no `clientCacheVersion` bump. The `toolsConfig` wire schema gets
stricter: a stored slot key outside the app's own surfaces is refused on write, so check for hand-written
rows before deploying.

## Run

No script: manual.

## Manual steps

1. Add `surfaces: {} as Partial<Record<SlotOf<(typeof hierarchy.channelTypes)[number]>, readonly string[]>>` to `shared/config/config.default.ts` (copy the template's entry and its comment), importing `SlotOf` from `../src/config-builder/types.ts`.
2. Each `placementOverrides` entry becomes a list. `'organization.tabs': { attachments: { hidden: true } }` becomes `'organization.tabs': ['courses', 'projects', 'members', 'settings']`: every id you keep, in the order you want, with the hidden one left out. A `locked` placement is no exception: leave it out and it goes.
3. Each `channelRouteConfig` entry: drop `defaultTabId`. Put that id first in the channel's `.tabs` list instead.
4. Each of your own `navTab` entries that carries an `order` to sort against template tabs (for example `order: -2`): drop the `order` and let the list position say it.
5. Delete `frontend/src/placement-config.ts` and its `pinned` entry in `cella/cella.config.ts`. Any `declare module '~/lib/placements'` block in it moves to a file that is still imported, for example `frontend/src/routes-config.tsx`.
6. `guardNavTabs(matches, parentRouteId, { defaultTabId })` loses that option; pass only `slotConfig`. A tabbed layout route must declare `staticData.tabsSlot`, which was optional before.
7. Replace the resolver's first argument: `isPlacementHidden(host, …)` and `resolvePlacementList(host, …)` take the `Slot`, never a route id, and the `overrides` option is gone.
8. `ToolsConfig` is `Partial<Record<ChannelSlot, SlotToolsConfig>>`: code indexing it with a plain `string` needs a `ChannelSlot` (`shared/placements`). The response schema lists one optional key per channel slot, so an SDK consumer reading `toolsConfig['account.settings']` no longer typechecks: those surfaces have no row.

## Verify

```sh
pnpm check
pnpm --filter frontend exec vitest run src/lib src/modules/common/page
pnpm --filter backend exec vitest run src/schemas
```
