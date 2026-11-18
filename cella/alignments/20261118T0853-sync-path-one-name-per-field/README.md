---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: relatedChannels, heldContextRoles
---

# The sync path keeps one name per field

App subscribers of `onChangeEvent` and `onSyncedRows` read `productType` where they read `entityType`.
`resolveHomeChannelId` and `getField` are gone (use `hierarchy.resolveDeepestAncestorId` and
`hierarchy.resolveNonNullAncestors`), `spliceEntitiesIntoListCaches` takes `entityType` and `organizationId` as
arguments, and `hierarchy.pathColumnSql(entityType)` loses its always-true second argument.

## What & why

The client renamed the wire's `productType` and rebuilt a frame's path from its caches. A stream change now carries
`path`, and a frame row's `stx` holds only `mutationId` and `sourceId` (`stxIdsSchema`), so a frame names 62 rows where
it named 20. Also: `enrichWithAncestorSlugs(item, entityType, slugIndex)`, `RoutableItemData` and
`resolveChannelPath` removed, and the CDC worker's `TableMeta` is one type with `strippedKeys`, `CounterDeltas` in its
types.

## Blast radius

Apps that subscribe to sync events, splice rows into list caches or build paths. `heldContextRoles` now reads a
channel and its ancestors only, so an app whose hierarchy declares `relatedChannels` no longer matches `visibleTo`
roles held on a related channel. None of the template's apps declares one.

## Run

No script: manual.

## Manual steps

1. Rename `entityType` to `productType` where app code reads an `AnnouncedChange` or `SyncedRows`.
2. Follow the typecheck for the removed helpers and the new `spliceEntitiesIntoListCaches` arguments.

## Verify

```sh
pnpm check
```
