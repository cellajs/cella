---
syncBreaking: true
clientCacheBump: false
---

# Product view-count helpers move to the entities module

findAttachmentViewCount is deleted; the shared findProductViewCount / productViewCountSelect /
productViewCountJoin (entities-queries.ts) and productViewCountSchema (entities-schema.ts) replace
the per-module copies, and the attachment module is rewritten onto them. No DB or wire change.
Forks: swap imports (opts key entityId->productId), replace inline coalesce-select/leftJoin/schema
fields with the helpers, delete fork-local duplicates like findItemViewCount. Apps that PIN the
attachment module must hand-apply the rewrite or their pinned copy silently keeps the deleted-export
pattern.

## What & why

View-count plumbing is now shared next to `product_counters`: `findProductViewCount`,
`productViewCountSelect()` and `productViewCountJoin()` in
`backend/src/modules/entities/entities-queries.ts`, plus `productViewCountSchema` in
`backend/src/modules/entities/entities-schema.ts`. The attachment module's byte-identical copies
(`findAttachmentViewCount`, inline `coalesce(view_count, 0)` select,
`leftJoin(productCountersTable, ...)`, inline `z.number().int().min(0).optional()` field) are
deleted in favor of the helpers.

## Blast radius

Sync-breaking for apps importing `findAttachmentViewCount` from
`#/modules/attachment/attachment-queries` (gone; call `findProductViewCount(ctx, { productId })`).
No DB, wire or `clientCacheVersion` change. Apps pinning the attachment module keep working but
should hand-apply the rewrite.

## Run

No script: manual.

## Manual steps

1. Replace `findAttachmentViewCount(ctx, { entityId })` with
   `findProductViewCount(ctx, { productId })` from `#/modules/entities/entities-queries`.
2. In product list queries, replace inline view-count selects/joins with
   `viewCount: productViewCountSelect()` and
   `.leftJoin(productCountersTable, productViewCountJoin(<table>.id))`.
3. In product response schemas, replace inline view-count fields with `productViewCountSchema`.
4. Delete fork-local duplicates of these four pieces (e.g. `findItemViewCount`).

## Verify

```sh
pnpm check   # product reads still return viewCount, no wire diff in sdk/gen
```
