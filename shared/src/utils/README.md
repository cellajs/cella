# shared/src/utils

## BlockNote schema configs (`blocknote-schema-configs.ts`)

React-free BlockNote schema configs, shared between the frontend editor and the
Yjs relay's server-side seeder. Both build their schema from these configs so
the ProseMirror node specs (names, attributes, content) stay identical: a
seeded Y.Doc must round-trip through the client editor without loss.

Render implementations stay in the frontend; the relay pairs these configs
with stub renders that are never invoked during block/Y.Doc conversion.

## Display order (`display-order.ts`)

Fractional ordering: items are placed between neighbors by averaging their
orders, allowing (in theory) infinite re-insertions without renumbering. In
practice, after many inserts between the same two items the float gap
converges and a rebalance is needed. `getOrderBetween` returns `null` in that
case so the caller can decide how to recover.

Entities use this with different sort directions:
- Pages, memberships: ascending (lower order = top)
- Tasks (board column): descending (higher order = top)

The `ascending` flag on `getRelativeOrder` only affects how `'top'`/`'bottom'`
drop edges map to before/after the target; the math is identical.
