# Hierarchy-derived entity arrays in config

## What & why

The entity taxonomy is now declared exactly once, in the hierarchy builder.
`config.default.ts` derives `entityTypes`, `channelEntityTypes`, and `productEntityTypes`
from `hierarchy.allTypes` / `hierarchy.channelTypes` / `hierarchy.productTypes`, wrapped in
the new `nonEmpty()` helper (shared) which narrows a runtime array to the non-empty tuple
type drizzle and zod enum sites require. The bidirectional compile-time checks between the
config arrays and the hierarchy in `config-validation.ts` are deleted (they are structurally
guaranteed now), and the `EntityIdColumnKeysShape` type export is removed as orphaned.

## Blast radius

Fork-breaking on `config.default.ts` only. Call sites do not change: the derived arrays keep
the exact literal-union element types, and `nonEmpty()` preserves the tuple shape enum sites
need, so `z.enum(appConfig.productEntityTypes)` and `varchar({ enum: ... })` compile as
before. A fork that keeps its literal arrays still compiles but reintroduces the drift the
old validation existed to catch, with that validation now gone: derive, do not redeclare.
Any fork import of `EntityIdColumnKeysShape` must be dropped (the derived map makes it
meaningless).

## Run

No script — manual.

## Manual steps

1. In your fork's `config.default.ts`, delete the hand-written `entityTypes`,
   `channelEntityTypes`, and `productEntityTypes` arrays (including any hoisted `const`s)
   and replace them with:
   `entityTypes: nonEmpty(hierarchy.allTypes)`,
   `channelEntityTypes: nonEmpty(hierarchy.channelTypes)`,
   `productEntityTypes: nonEmpty(hierarchy.productTypes)`.
   Import `nonEmpty` from `../src/config-builder/utils` and `hierarchy` from your hierarchy
   config module.
2. Rewrite any local `(typeof productEntityTypes)[number]` style references to
   `(typeof hierarchy.productTypes)[number]`.
3. Remove fork imports of `EntityIdColumnKeysShape` if any exist.

## Verify

```sh
pnpm check
```

Entity-type unions (`EntityType`, `ChannelEntityType`, `ProductEntityType`) must be
unchanged; any type error at an enum site means a hand-written array survived somewhere.
