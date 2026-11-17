---
breaking: true
clientCacheBump: true
caughtBy: compiler
grep: numberedProductTypes, letter:, LinkPreview, product_numbering, product_number_moves, appFullCrudTables, format-bytes
generate: true
---

# Numbered products and file share links

The template numbers products: `numberedProducts` in `config.default.ts` names each numbered product type and the
letter of its share links, `{ attachment: 'a' }` by default. Attachments carry `number` and link as `/{code}/a7`. A
module's `productShareLink` loses `letter`, every `LinkPreview` says whether it is `indexable`, and `formatBytes`
moves to `shared/utils/format-bytes`.

## What & why

A copied document wrote a file's attachment id, which opens nothing. `blocksForExport` now writes a file as its share
link (`attachmentShareLink`), which unfurls over a picture of its kind and opens the file in the app through `/n`.
Numbering lives in `modules/numbering`, the `20-product-numbering` producer and `numberColumn`/`homeNumberIndex`.

## Blast radius

Every app: the config key is required, `attachments` gains `number` (bump `clientCacheVersion`), and private previews
answer `noindex`. An app that numbered rows itself, as raak did, takes the template's module: same paths and tables.

## Run

No script: manual.

## Manual steps

1. Add `numberedProducts` to `shared/config/config.default.ts`: `{ attachment: 'a' }`, plus the app's own numbered types and letters.
2. Drop `product_numbering` and `product_number_moves` from `appFullCrudTables`: the RLS producer grants them now.
3. Remove `letter` from each `productShareLink`, and add `indexable` to each `LinkPreview` the app returns.
4. Import `formatBytes` from `shared/utils/format-bytes`.
5. `pnpm generate`: it adds `attachments.number` and its unique index, and the side-effect block numbers existing rows once.
6. `pnpm cella shoot` the `link-preview-*` shots, which write the app's own `static/link-previews/<kind>.jpg`.

## Verify

```sh
pnpm generate
pnpm check
```
