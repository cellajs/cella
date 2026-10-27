# shared/src/utils

## BlockNote schema configs: [blocknote-schema-configs.ts](./blocknote-schema-configs.ts)

React-free BlockNote schema configs shared by the frontend editor and the backend's Y.Doc conversion, so the ProseMirror node specs (names, attributes, content) stay identical and a document converted on the server round-trips through the client editor without loss. Render implementations stay in the frontend; the server schema pairs these configs with minimal renders, which converting between blocks and a Y.Doc never invokes.

## Media references: [media-ref.ts](./media-ref.ts)

One grammar for what a media block's `url` may hold: an attachment id, a storage key under the document's organization, or an asset URL on the configured `mediaAssetOrigin`. Everything else is `invalid`, external URLs included. Client writes refuse it, materializing a collaborative description blanks it, and the renderers (the editor and the static document render) show nothing for it, so a check at write time and one at render time cannot disagree.

## Display order: [display-order.ts](./display-order.ts)

Fractional ordering: an item is placed between neighbors by averaging their orders. After many inserts between the same two items the float gap converges and a rebalance is needed; the helper reports that and the caller decides how to recover.

A list is ascending by default: the lowest order is at the top. A list whose top holds the highest order, such as a board column, is descending. The direction only changes whether a drop on the target's top or bottom edge goes before or after it; the math is identical.
