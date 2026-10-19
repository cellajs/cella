---
syncBreaking: true
clientCacheBump: false
---

# The creator index of a product table holds the organization too

`productIndexes` builds `<table>_created_by_index` on `(created_by, organization_id)`. Run `pnpm generate`: it drops and
recreates that index on every product table that spreads `productIndexes`.

## What & why

A creator's rows are read within one organization (member counts, the replay check), and the member count query was
already written for the two-column index. The index name stays.

## Blast radius

Every app: one generated migration, an index rebuild per product table. No data change, no cache change. An app that
wrote the two-column index by hand under the same name can spread `productIndexes` again.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; the migration drops and creates `<table>_created_by_index` for each product table. `pnpm generate` alone is enough.
2. A table that lists its own five product indexes in place of `...productIndexes('<table>', table)` goes back to the spread.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
