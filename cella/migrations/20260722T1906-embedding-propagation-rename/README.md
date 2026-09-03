# Rename embedding propagation contract to embedded/host product

## What & why

`PropagationHint` fields use the `productEmbeddings` vocabulary: `sourceType` -> `embeddedProduct`,
`targetType` -> `hostProduct`, `field` -> `hostColumn`. Touched: the exported `PropagationHint`
type (`shared`), the wire schema `propagationHintSchema` on `StreamNotification.propagation` and
catchup `changes[].propagation`, `build-message.ts`, `propagation-hints.ts` (`propagationTargets`
-> `hostsByEmbeddedProduct`), `propagation.ts`. The two product-type wire fields tighten from
`z.string()` to `z.enum(productEntityTypes)`.

## Blast radius

Sync-breaking and cache-bumping; no database change; `productEmbeddings` config keys unchanged. The
`StreamNotification.propagation` wire shape changed, so `schema-bust-gate` demands a
`clientCacheVersion` bump even with `productEmbeddings: []`. App code reading `.sourceType` /
`.targetType` / `.field` on a hint or constructing a `PropagationHint` fails `pnpm check`; apps
with no custom propagation code only need the bump.

## Run

No script, manual (`sourceType`, `targetType`, `field` are too generic for a safe codemod).

## Manual steps

1. Grep for hint field reads outside the upstream files; rename
   `sourceType` -> `embeddedProduct`, `targetType` -> `hostProduct`, `field` -> `hostColumn` in
   propagation hints only (leave `resourceType`, data-grid columns, form fields alone):

   ```sh
   grep -rnE "\.(sourceType|targetType)\b" --include=*.ts --include=*.tsx \
     backend/src frontend/src cdc/src shared | grep -v resourceType
   grep -rn "PropagationHint" --include=*.ts backend/src frontend/src shared
   ```

2. `propagationTargets` references become `hostsByEmbeddedProduct`.
3. Bump `clientCacheVersion` in `shared/config/config.default.ts` (any new value); queued
   mutations survive the wipe.

## Verify

```sh
pnpm sdk       # regenerate the SDK from the renamed wire schema
pnpm check     # typecheck catches any missed hint-field reference
```
