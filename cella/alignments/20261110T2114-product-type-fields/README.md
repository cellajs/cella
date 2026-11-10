---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: embeddedProduct, hostProduct, notificationsTable.entityType, markSeen
generate: true
---

# A field that names another row's product type is productType

`notifications.entityType` is `productType`, and `pnpm generate` with this folder's `hints.json` renames its column.
`ProductEmbedding` (`appConfig.productEmbeddings`) has `embeddedProductType` and `hostProductType` where it had
`embeddedProduct` and `hostProduct`, and a propagation hint carries `embeddedProductType`. The `markSeen` body, each
catchup view and its answer, the notification response and the `/n` link search carry `productType` where they carried
`entityType`, and the `markSeen` body names its ids `productIds`.

## What & why

The stream change frame, `seen_by.productType` and `product_counters.productType` already named another row's product
type `productType`, beside `channelType` for a channel's. The notification row, the seen batch, the catchup views and
the embedding config said `entityType` or `embeddedProduct` for the same value. One value now has one name, and
`entityType` stays for a row's or a frame's own type.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read and each `productEmbeddings` entry.
Raw SQL, untyped test rows and outside clients that name `entityType` on these shapes escape it. A notification link
mailed before the deploy opens the channel without its subject. `clientCacheVersion` moves.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T2114-product-type-fields/hints.json)"`.
2. Rename `embeddedProduct` to `embeddedProductType` and `hostProduct` to `hostProductType` in the app's `productEmbeddings` and in tests that expect a propagation hint.
3. Replace `entityType` with `productType` on notification rows (`entity_type` with `product_type` in raw SQL), seen batch bodies, catchup views and `/n` links, and a seen batch's `entityIds` with `productIds`.

## Verify

```sh
pnpm migrate
pnpm check
```
