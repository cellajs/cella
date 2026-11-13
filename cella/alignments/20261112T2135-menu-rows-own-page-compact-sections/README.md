---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: subitemOf, makeMembership
---

# Menu rows open their own page; sections can be compact or fixed

`ChannelRouteEntry.subitemOf` is gone and `getChannelRoute(item)` takes one argument: every menu row opens its own
channel's page. An app that shows a channel inside another channel's page sets `channel.productRoute` on that channel's
module, and `getProductRoute(location)` follows it. `MenuSectionOptions` gains `compact` and `collapsible`, `rowMark`'s
second argument is `isCompact`, the rows read their section options from the module registry, and
`MenuSheetHiddenGroup` takes `entityType`.

## What & why

A sub-row that linked to a panel in its parent's page needed `subitemOf`, a second route argument and ancestor slugs
read from memberships. Rows now link to their own page; a product's page choice lives in `productRoute`
(`lib/entity-modules.ts`). Channel enrichment reads ancestor ids from the row alone. `MenuSheetItem`,
`MenuSheetItemEdit`, `MenuSheetItemsList` and `MenuSheetDraggableItem` drop their `icon` and `options` props.

## Blast radius

Apps with a menu submenu, a `subitemOf` route entry, a `rowMark`, or code rendering the menu sheet's lists. Apps
using only cella's menu see the restyle alone: a filled open-page row, quieter header buttons, one faint mark colour.
No wire, cache or schema change.

## Run

No script: manual.

## Manual steps

1. Remove `subitemOf` from `channelRouteConfig` (`routes-config.tsx`) and the second argument of `getChannelRoute`.
2. Where a channel's products open on another channel's page, add `productRoute` to its `channel` module config.
3. In `rowMark`, read the second argument as `isCompact`: true for sub-rows and rows of a `compact` section.
4. Pass `entityType` to each `MenuSheetHiddenGroup`; drop `icon` and `options` props from the menu sheet's lists and rows.
5. Set `compact: true` on a section that lists rows of a type another section nests, `collapsible: false` to keep one open.
6. Replace `makeMembership` and `menuStructure` in enrichment tests with rows that carry their own ancestor ids.

## Verify

```sh
pnpm check
```
