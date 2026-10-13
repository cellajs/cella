---
syncBreaking: true
clientCacheBump: false
---

# Helpers both apps copied arrive in the template, with fixes of what the reference got wrong

The template gains `productIndexes`, `filterExistingProductIds`, `uniqueIdsSchema`, `mockStxFor`, `arrangePlacements`,
`useOpenUserSheet`, `LazyBlockNoteContentFormField` and `defaultOrderFor`. The frontend reads an app's own error texts
from `appError.json`, a replayed create of the reference answers 200, and `product-mock-registry.test.ts` holds every
product mock to its key and its table's columns. An app deletes its copies.

## What & why

An app aligned its modules with the reference and listed what it had to write itself and what the reference got wrong:
a tab arrangement that ignored `appConfig.surfaces`, a detail seeded from a list row and never fetched, a redirect to a
renamed slug, error texts that reached no user, a delete form that hung offline. Each defect has a test that failed
first.

## Blast radius

Sync-breaking only where an app carries a copy at the template's path
(`frontend/src/modules/common/form-fields/lazy-blocknote.tsx`) or a product mock that drops its key. No database
change (`productIndexes` keeps the index names), no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `frontend/src/modules/common/form-fields/lazy-blocknote.tsx` of an app's own: take the template's file, which exports `LazyBlockNoteContentFormField`.
2. Run `pnpm test:core`. `product-mock-registry.test.ts` fails for a product mock that ignores its `key` or returns a key that is no column of its table: pass the key to `withFakerSeed` and return the select shape.
3. A product table's five standard indexes: `...productIndexes('<table>', table)` from `#/db/utils/product-columns`, in place of the five `index(...)` lines. `pnpm generate` reports no schema change when the names matched `<table>_<column>_index`.
4. A function that filters ids down to the live rows of the organization before a host row stores them: `filterExistingProductIds(ctx, { entityType, ids })` from `#/modules/entities/entities-queries`, inside the write's tenant transaction.
5. A relation id array schema (`validUuidSchema.array().max(50).refine(unique)`): `uniqueIdsSchema()` from `#/schemas`.
6. A test builder for a stamped stx: `mockStxFor('<field>', ...)` from `#/schemas/sync-transaction-mocks`.
7. `navTab.order` fields kept only so `TabsArrangementCard` matched the tab bar: delete them. The card orders by `appConfig.surfaces` as the bar does.
8. A helper that fetches a channel's detail when the resolved row has no counts: delete it. `resolveChannelBySlug` fetches a detail it seeded from a list row.
9. A user-facing text of an app error kept in `app.json`: move it to `appError.json` as `<type>` and `<type>.text`. The toast and the error page read that file before `error.json`.
10. An invalid-submit handler written to show a custom rule's own message: `defaultOnInvalid` shows it.
11. A notification declaration that casts fields of its row: type it as `ModuleNotifications<NotificationSubjectRow & Pick<<Row>, '<column>'>>`.
12. An opener of the user sheet written inline: `useOpenUserSheet()` from `~/modules/user/use-open-user-sheet`. A list's default order written inline: `defaultOrderFor(sort)` from `~/query/basic/get-query-key-sort-order`.
13. A `files.maxSize` an app added to `biome.jsonc`, and a `lib` an app set in `bench`, `cdc` or `yjs` to match the backend: take the template's files.
14. Optional, for a product create of an app's own that documents 200: return `replayed` from the operation and answer `replayed ? 200 : 201`, as `attachment-handlers.ts` does. A delete form of an offline-capable product follows `delete-attachments.tsx`: `mutate`, no await, `allowOfflineDelete`.

## Verify

```sh
pnpm check
pnpm test:core
pnpm unused
```
