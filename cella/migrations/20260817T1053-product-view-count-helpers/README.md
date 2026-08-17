# Product view-count helpers move to the entities module

## What & why

Per-product view-count plumbing is now shared where `product_counters` lives:
`findProductViewCount`, `productViewCountSelect()`, and `productViewCountJoin()` in
`backend/src/modules/entities/entities-queries.ts`, plus `productViewCountSchema` in
`backend/src/modules/entities/entities-schema.ts`. The attachment module consumed its own
byte-identical copies (`findAttachmentViewCount`, an inline `coalesce(view_count, 0)` select and
`leftJoin(productCountersTable, ...)`, an inline `z.number().int().min(0).optional()` field);
those are deleted and the module now uses the shared helpers. Every fork product module was
re-deriving the same four pieces.

## Blast radius

Sync-breaking for apps that import `findAttachmentViewCount` from
`#/modules/attachment/attachment-queries` — the export is gone; call
`findProductViewCount(ctx, { productId })` instead (same body, renamed opts key). No database
change, no wire change (`viewCount` fields are emitted identically), no `clientCacheVersion`
bump. Apps that pin the attachment module keep working but should hand-apply the rewrite to
stay converged. Fork product modules carrying their own copies (e.g. an `findItemViewCount`)
can delete them and adopt the shared helpers.

## Run

No script — manual.

## Manual steps

1. Replace `findAttachmentViewCount(ctx, { entityId })` imports/calls with
   `findProductViewCount(ctx, { productId })` from `#/modules/entities/entities-queries`.
2. In product list queries, replace inline view-count selects/joins with
   `viewCount: productViewCountSelect()` and
   `.leftJoin(productCountersTable, productViewCountJoin(<table>.id))`.
3. In product response schemas, replace inline view-count fields with `productViewCountSchema`.
4. Delete any fork-local duplicates of these four pieces.

## Verify

`pnpm check` passes; product reads still return `viewCount` (no wire diff in `sdk/gen`).
