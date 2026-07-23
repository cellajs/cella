# Hierarchy instance-only row-location API

## What & why

The `EntityHierarchy` instance is now the ONLY entry point for row location and entity-kind
guards. Removed from the `shared` barrel:

- Free functions `resolveDeepestAncestorId`, `resolveNonNullAncestors`,
  `possibleHomeChannels`, `computeAncestorPath`, `computeProductPath`, `computeChannelPath`,
  `pathColumnSql`, `deepestAncestorSql` (call the same-named method on a hierarchy instance).
- Entity guards `isChannelEntity`, `isProductEntity`, `getChannelRoles`
  (`shared/src/entity-guards.ts` deleted; use `hierarchy.isChannel`, `hierarchy.isProduct`,
  `hierarchy.getRoles`; the guards now accept `null | undefined` and return false).
- Types `AncestorSource`, `CountsHierarchy`, `TopologyHierarchy`: every injectable-topology
  parameter is now typed `EntityHierarchy` (the class gained generic defaults so the bare
  name works as an annotation). `PermissionTopology.hierarchy` is an `EntityHierarchy`.

The id-column snake-caser is single-sourced: `entityIdColumnName(type)` delegates to
`toColumnName`, so the camel-to-snake regex exists once.

## Blast radius

Fork-breaking on imports and call shape, mechanical to apply. No wire, DB, or behavior
change: every removed function's implementation is the method's implementation. Tests that
passed hand-rolled `{ getOrderedAncestors: ... }` fakes must build real instances with
`createEntityHierarchy` (see `shared/testing/deep-fixture.ts` and `wide-fixture.ts`).

## Run

No script — manual. The patterns are regular enough for search-and-replace:

- `fn(h, a, b)` becomes `h.fn(a, b)` for the eight row-location functions.
- `isProductEntity(x)` becomes `hierarchy.isProduct(x)` (same for channel/roles variants).
- Type annotations `AncestorSource` / `CountsHierarchy` / `TopologyHierarchy` become
  `EntityHierarchy` (import type from `shared`).

## Manual steps

1. Sweep fork-local code for the removed imports (`grep -rn "isProductEntity\|isChannelEntity\|getChannelRoles\|AncestorSource\|resolveDeepestAncestorId\|computeProductPath\|computeChannelPath\|computeAncestorPath\|possibleHomeChannels\|resolveNonNullAncestors" src/`) and apply the patterns above.
2. Replace any hand-rolled hierarchy fakes in tests with real builder instances.
3. If fork code relied on `isProductEntity(nullableValue)` null tolerance, the instance
   methods now accept `null | undefined` directly.

## Verify

```sh
pnpm check
```
