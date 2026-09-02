# Hierarchy instance-only row-location API

## What & why

The `EntityHierarchy` instance is the only entry point for row location and entity-kind guards.
Removed from the `shared` barrel: free functions `resolveDeepestAncestorId`,
`resolveNonNullAncestors`, `possibleHomeChannels`, `computeAncestorPath`, `computeProductPath`,
`computeChannelPath`, `pathColumnSql`, `deepestAncestorSql` (same-named instance methods); guards
`isChannelEntity`, `isProductEntity`, `getChannelRoles` (`shared/src/entity-guards.ts` deleted; use
`hierarchy.isChannel` / `hierarchy.isProduct` / `hierarchy.getRoles`, which accept `null | undefined`
and return false; `shared` re-exports the app singleton's bound `isChannel` / `isProduct` as
aliases); types `AncestorSource`, `CountsHierarchy`, `TopologyHierarchy` (annotate
`EntityHierarchy`; `PermissionTopology.hierarchy` is one). `entityIdColumnName(type)` delegates to
`toColumnName`.

## Blast radius

Sync-breaking on imports and call shape, mechanical. No wire, DB, or behavior change. Test mocks
replacing `hierarchy` must override `isChannel`/`isProduct` from the same synthetic instance;
hand-rolled `{ getOrderedAncestors: ... }` fakes become real `createEntityHierarchy` instances (see
`shared/testing/deep-fixture.ts` and `wide-fixture.ts`).

## Run

No script, manual search-and-replace:

- `fn(h, a, b)` becomes `h.fn(a, b)` for the eight row-location functions.
- `isProductEntity(x)` becomes `hierarchy.isProduct(x)` (same for channel/roles variants).
- `AncestorSource` / `CountsHierarchy` / `TopologyHierarchy` annotations become `EntityHierarchy`
  (import type from `shared`).

## Manual steps

1. Sweep app code for the removed imports and apply the patterns above: `grep -rn "isProductEntity\|isChannelEntity\|getChannelRoles\|AncestorSource\|resolveDeepestAncestorId\|computeProductPath\|computeChannelPath\|computeAncestorPath\|possibleHomeChannels\|resolveNonNullAncestors" src/`
2. Replace hand-rolled hierarchy fakes in tests with real builder instances.
3. Code relying on `isProductEntity(nullableValue)` null tolerance: the instance methods accept
   `null | undefined` directly.

## Verify

```sh
pnpm check
```
