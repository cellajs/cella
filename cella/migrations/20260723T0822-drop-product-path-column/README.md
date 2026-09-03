# Drop the product tables' stored path column

## What & why

Product tables lose their generated `path` column; `hierarchy.computeProductPath` derives it from
the row's ancestor id columns at the three consumers: CDC batch grouping (`activity-service`), CDC
move detection (`update.ts`, old vs new location from the REPLICA IDENTITY FULL images), and
stream notifications (`build-message.ts`, including the moveOut path from `movedFrom`). SQL and JS
path rules are parity-tested, so values are byte-identical. Channel tables keep their generated
`path` (mirrored to `channel_counters.path`). `productPathColumn` leaves
`backend/src/db/utils/path-column.ts` (`channelPathColumn` stays); `'path'` leaves the CDC
permission-row subset (`permission-row-data.ts`).

## Blast radius

Sync-breaking with a wire-shape change: product REST responses lose `path`, so `clientCacheVersion`
is bumped (`v4-no-product-path`). SSE notifications still carry a computed `path`. DB: one dropped
column per product table via `pnpm generate`. Client code reading `path` off cached PRODUCT rows (no
current app does) switches to `hierarchy.computeProductPath(type, row)`; channel rows are unaffected.

## Run

No script, manual.

## Manual steps

1. Pull the template change and run `pnpm generate` so drizzle emits the DROP COLUMN migration for
   every product table.
2. Remove app mock/seed code that sets `path` on product rows or product response mocks.
3. Replace client reads of `path` from cached product entities with
   `hierarchy.computeProductPath(entityType, row)`; channel-row `path` reads stay.
4. Bump your app's `clientCacheVersion` if you maintain your own (the template bump arrives with the
   sync).

## Verify

```sh
pnpm generate
pnpm check
pnpm test   # backend/src/db/utils/path-column.test.ts parity suite; CDC and stream tests cover grouping, move detection, moveOut
```
