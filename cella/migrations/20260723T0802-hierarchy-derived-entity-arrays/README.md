# Hierarchy-derived entity arrays in config

## What & why

The entity taxonomy is declared once, in the hierarchy builder. `config.default.ts` derives
`entityTypes`, `channelEntityTypes`, and `productEntityTypes` from `hierarchy.allTypes` /
`hierarchy.channelTypes` / `hierarchy.productTypes` through the new shared `nonEmpty()` helper,
which narrows to the non-empty tuple drizzle and zod enum sites require. The bidirectional
compile-time checks in `config-validation.ts` are deleted and the orphaned
`EntityIdColumnKeysShape` export is removed.

## Blast radius

Sync-breaking on `config.default.ts` only; call sites keep their literal-union element types and
tuple shape, so `z.enum(appConfig.productEntityTypes)` and `varchar({ enum: ... })` compile as
before. No wire or DB change. Literal arrays still compile but reintroduce unchecked drift: derive,
do not redeclare. App imports of `EntityIdColumnKeysShape` must go.

## Run

No script, manual.

## Manual steps

1. In `config.default.ts`, delete the hand-written `entityTypes`, `channelEntityTypes`, and
   `productEntityTypes` arrays (including hoisted `const`s) and write
   `entityTypes: nonEmpty(hierarchy.allTypes)`, `channelEntityTypes: nonEmpty(hierarchy.channelTypes)`,
   `productEntityTypes: nonEmpty(hierarchy.productTypes)`; import `nonEmpty` from
   `../src/config-builder/utils` and `hierarchy` from your hierarchy config module.
2. Rewrite `(typeof productEntityTypes)[number]` style references to
   `(typeof hierarchy.productTypes)[number]`.
3. Remove app imports of `EntityIdColumnKeysShape`.

## Verify

```sh
pnpm check   # EntityType/ChannelEntityType/ProductEntityType unions unchanged; a type error at an enum site means a hand-written array survived
```
