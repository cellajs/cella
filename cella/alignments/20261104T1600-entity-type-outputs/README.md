---
breaking: false
clientCacheBump: false
grep: AncestorChannelType, resolveNonNullAncestors, possibleHomeChannels
---

# Entity type outputs carry the config's unions

The hierarchy's row-location outputs, the frontend query, sync and notification layers, the scope check and placement
grants now carry the unions `shared/types.ts` derives from the config (`ChannelEntityType`, `ProductEntityType`,
`EntityType`, `AccessScopedEntityType`, `EntityActionType`) where they took or returned `string`. No app edit is required
to compile. An app may delete what the narrow outputs made redundant: an `isChannel` re-check of a
`resolveNonNullAncestors` result, a hand-spelled `Exclude<AncestorChannelType<T>, 'organization'>` (now
`HomeChannelType<T>`), and a placement type identical to the template's `ResolvedPlacement`.

## What & why

`ResolvedAncestor<C>`, `possibleHomeChannels()` and `entityIdColumnKey()` return the hierarchy's channel union, and
`shared` exports `HomeChannelType<T>`. The entity query registry, `RoutableItemData`, `CanRow`, cache-ops, the sync store,
`mergeServerResponse`, the notification sources, `accessScopes.allows`, `getEntityPolicies` and a placement's
`requires` and `grants` take the unions. `createEntityKeys` takes the filters type alone. Each `string` made a caller
re-check what its type already knew.

## Blast radius

Not breaking: app modules call these with literals or SDK rows and compile unchanged. `getSyncTier` and
`resolveChannelPath` each lost a parameter no app module passes. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Drop an `isChannel(...)` check on the `type` of a `hierarchy.resolveNonNullAncestors` result: it is a `ChannelEntityType` already (projectcampus `frontend/src/modules/common/product-placement.ts`, `resolveProductHome`).
2. Spell `Exclude<AncestorChannelType<T>, 'organization'>` as `HomeChannelType<T>` from `shared` (projectcampus `ProductHomeType` in `backend/src/modules/entities/product-placement.ts` and `ProductPlacement` in `frontend/src/modules/common/product-placement.ts`).
3. Import `ResolvedPlacement` from `#/permissions/product-placement` in place of an identical app type (projectcampus `ProductPlacement` in `backend/src/modules/entities/product-placement.ts`); keep a guard that narrows to one product's own homes, such as `isHomeType`.
4. Where typecheck flags an app test that casts a synthetic product `as EntityType` and passes it to cache-ops or the sync store, cast it `as ProductEntityType`.

## Verify

```sh
pnpm check
```
