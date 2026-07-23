# Drop the product tables' stored path column

## What & why

Product rows no longer store a generated `path` column. Their location path is computed from
the ancestor id columns on the same row via `hierarchy.computeProductPath`, at the three
places that consumed the stored value: CDC batch grouping (`activity-service`), CDC move
detection (`update.ts`, comparing computed old and new location from the REPLICA IDENTITY
FULL images), and backend stream notifications (`build-message.ts`, including the moveOut old
path from `movedFrom`). The SQL and JS path rules are parity-tested, so computed values are
byte-identical to what the column stored.

**Channel tables keep their generated path column.** It remains the canonical ancestry that
CDC mirrors onto `channel_counters.path` for catchup prefix verification, and the value fork
client resolvers read off cached channel rows.

`productPathColumn` is removed from `backend/src/db/utils/path-column.ts`
(`channelPathColumn` stays), and `'path'` leaves the CDC permission-row subset
(`permission-row-data.ts`); the ancestor id columns already carried there are sufficient.

## Blast radius

Fork-breaking, with a wire-shape change: product REST responses lose the `path` field
(drizzle `createSelectSchema` exposed it), so this ships with a `clientCacheVersion` bump
(`v4-no-product-path`). SSE notifications still carry `path`, computed, with identical
values. The database change is one dropped column per product table, produced by
`pnpm generate`. Forks whose client code reads `path` off cached PRODUCT rows (none of the
current forks do; channel rows are unaffected) must switch to
`hierarchy.computeProductPath(type, row)`.

## Run

No script — manual.

## Manual steps

1. Pull the template change; run `pnpm generate` so drizzle emits the DROP COLUMN migration
   for every product table in your fork.
2. Remove any fork mock/seed code that sets `path` on product rows or product response mocks.
3. If fork client code reads `path` from cached product entities, replace it with
   `hierarchy.computeProductPath(entityType, row)`. Channel-row `path` reads are unaffected.
4. Bump your fork's `clientCacheVersion` if you maintain your own (the template bump arrives
   with the sync).

## Verify

```sh
pnpm generate
pnpm check
pnpm test
```

The parity suite (`backend/src/db/utils/path-column.test.ts`) still proves the SQL and JS
path rules agree; CDC and stream tests cover computed grouping, move detection, and moveOut.
