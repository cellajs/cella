# Rename embedding propagation contract to embedded/host product

## What & why

The embedding-propagation hint used a third vocabulary (`source`/`target`) for the two roles that
the `productEmbeddings` config already names `embedded`/`host`. The hint fields are renamed to match
the config, so there is now one vocabulary end to end:

- `sourceType` -> `embeddedProduct`
- `targetType` -> `hostProduct`
- `field` -> `hostColumn`

This touches the exported `PropagationHint` type (`shared`), the wire schema
`propagationHintSchema` on `StreamNotification.propagation` and the catchup `changes[].propagation`
array, plus the producers/consumers `build-message.ts`, `propagation-hints.ts`
(`propagationTargets` -> `hostsByEmbeddedProduct`), and `propagation.ts`. The two product-type wire
fields are also tightened from `z.string()` to `z.enum(productEntityTypes)`.

## Blast radius

Fork-breaking and cache-bumping. The `productEmbeddings` config keys are unchanged, so config needs
no edit. But the wire shape of `StreamNotification.propagation` changed, which is a breaking OpenAPI
diff: the fork's `schema-bust-gate` will demand a `clientCacheVersion` bump on the sync PR even for a
fork with `productEmbeddings: []` that never emits a hint. Any fork code that reads a propagation
hint's `.sourceType` / `.targetType` / `.field`, constructs a `PropagationHint`, or imports the
`PropagationHint` type and destructures its fields, breaks at compile time (caught by `pnpm check`).
A fork that added no custom propagation code only needs the `clientCacheVersion` bump.

No database change.

## Run

No script -- manual. The three field names (`sourceType`, `targetType`, `field`) are too generic for
a safe word-boundary codemod (`field` especially), so rename by hand in propagation contexts only.

## Manual steps

1. Grep your fork for hint field reads outside the upstream files (which arrive already migrated):

   ```sh
   grep -rnE "\.(sourceType|targetType)\b" --include=*.ts --include=*.tsx \
     backend/src frontend/src cdc/src shared | grep -v resourceType
   grep -rn "PropagationHint" --include=*.ts backend/src frontend/src shared
   ```

   In each propagation hint, rename `sourceType` -> `embeddedProduct`, `targetType` -> `hostProduct`,
   `field` -> `hostColumn`. Do not touch unrelated identifiers named `field`, `sourceType`, or
   `targetType` (e.g. `resourceType`, data-grid columns, form fields).

2. If your fork references the renamed map `propagationTargets`, use `hostsByEmbeddedProduct`.

3. Bump `clientCacheVersion` in your fork's `shared/config/config.default.ts` (any new value) so the
   `schema-bust-gate` passes and clients wipe stale cache. Queued mutations survive the wipe.

## Verify

```sh
pnpm sdk       # regenerate the SDK from the renamed wire schema
pnpm check     # typecheck catches any missed hint-field reference
```
