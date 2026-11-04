---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: z.boolean, z.number, filterValues, toggleFilterValue, includeQuerySchema, userIds
---

# Search params are strings, a list is one comma-separated key

The router reads every search value as a string and writes a list as its values joined by commas. A route schema takes `booleanSearchParam` for a flag and `csvSearchParam()` for a list, the API reads the same list through `csvQuerySchema()`, which replaces each hand-written `split(',')` query parser, and `useSearchParams` passes an array through unchanged.

## What & why

TanStack's default serializer parsed `?q=123` as a number, which crashed a page, and wrote a typed `123` as `?q=%22123%22`. Upstream replaced it with `routes/-search-serializer.ts`, made the hook pass an array through, and gave both sides one list helper: `csvSearchParam` in `modules/common/search-params-schemas.ts` and `csvQuerySchema` in `backend/src/schemas/common-schemas.ts`, now behind `includeQuerySchema` and the members list's `userIds`.

## Blast radius

Every app route schema with a `z.boolean()` or `z.number()` search param now receives a string. An app query schema that splits a comma list by hand keeps working as a second copy. An absent `userIds` reads as `[]`. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. In each `search-params-schemas.ts` and inline `validateSearch`, replace `z.boolean().optional()` with `booleanSearchParam` and a number with `z.coerce.number()`.
2. Replace a comma-list search param parsed by hand (`split(',')`, a `filterValues` helper) with `csvSearchParam(item)`, and pass arrays to `setSearch` or `navigate`.
3. Replace each query schema that splits a comma list (`z.string().max(…).transform(…).pipe(z.array(…))`) with `csvQuerySchema(item, maxItems)`, and treat an absent list as `[]`.
4. Drop a `.max(maxLength.html)` on a list query param: the helper bounds it by `maxLength.url` and `maxItems`.

## Verify

```sh
pnpm sdk
pnpm check
```

Open a list page with `?q=123` and with a filter list in the URL, then reload: the page keeps the search and shows no error.
