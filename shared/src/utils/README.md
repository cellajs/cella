# shared/src/utils

## BlockNote schema configs: [`blocknote-schema-configs.ts`](./blocknote-schema-configs.ts)

React-free BlockNote schema configs shared by the frontend editor and the Yjs relay's server-side seeder, so the ProseMirror node specs (names, attributes, content) stay identical and a seeded Y.Doc round-trips through the client editor without loss. Render implementations stay in the frontend; the relay pairs these configs with stub renders that block/Y.Doc conversion never invokes.

## Media references: [`media-ref.ts`](./media-ref.ts)

One grammar for what a media block's `url` may hold: an attachment id, a storage key under the document's organization (`isOrganizationKey`), or an asset URL on the configured `mediaAssetOrigin`. Everything else is `invalid`, external URLs included. Client writes refuse it (`assertBlockMediaUrls`), the Yjs relay blanks it (`sanitizeBlockMediaUrls`), and the renderers (`resolveBlockNoteFileRef`, the static document render) show nothing for it, so a check at write time and one at render time cannot disagree.

## Display order: [`display-order.ts`](./display-order.ts)

Fractional ordering: an item is placed between neighbors by averaging their orders. After many inserts between the same two items the float gap converges and a rebalance is needed; `getOrderBetween` returns `null` so the caller decides how to recover.

Sort direction differs per entity:

- Pages, memberships: ascending (lower order = top)
- Tasks (board column): descending (higher order = top)

The `ascending` flag on `getRelativeOrder` only changes how `'top'`/`'bottom'` drop edges map to before/after the target; the math is identical.
