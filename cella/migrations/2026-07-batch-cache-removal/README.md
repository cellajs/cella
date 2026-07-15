# Batch cache-token removal migration

Removes the unused **batch cache** machinery from the sync engine — the
`batchCache()` middleware, per-row `batchReservations`, and the batch token
index — while keeping the single-entity `appCache` / `X-Cache-Token` detail
cache untouched. Upstream cella arrives already migrated; this runs the same
edits on fork-specific code so a `cella-cli pull` sees matching changes on both
sides.

## What changed upstream

- CDC no longer mints a batch token or `batchReservations`; batch messages send
  `cacheToken: null`. The backend keeps single-entity detail caches fresh on
  batch writes by invalidating each row's entity from `batchRows` (by id).
- The frontend `DeltaFetchFn` type dropped its 4th `options` param (it only ever
  carried `cacheToken` for an `X-Cache-Token` header the **list** endpoint never
  consumed). This is the fork-breaking change: your `registerEntityQueryKeys`
  delta-fetch registrations use the old 4-arg shape.

## What forks must do

The codemod surface is small and manual (no script — usually 1–6 sites).

1. **Fix each `deltaFetch` registration.** Find them:

   ```sh
   grep -rn "registerEntityQueryKeys" frontend/src
   ```

   Base cella has **1** (attachment). Known forks: **raak 3**
   (attachment/label/task), **projectcampus 6**
   (item/label/material/comment/submission/attachment). For each, drop the 4th
   `options` param and any header built from it:

   ```diff
   -registerEntityQueryKeys('task', keys, (organizationId, tenantId, seqCursor, options) => {
   -  return getTasks({
   -    path: { tenantId: tenantId!, organizationId: organizationId! },
   -    query: { seqCursor, limit: String(SYNC_CHUNK_SIZE) },
   -    headers: options?.cacheToken ? { 'x-cache-token': options.cacheToken } : undefined,
   -  });
   -});
   +registerEntityQueryKeys('task', keys, (organizationId, tenantId, seqCursor) => {
   +  return getTasks({
   +    path: { tenantId: tenantId!, organizationId: organizationId! },
   +    query: { seqCursor, limit: String(SYNC_CHUNK_SIZE) },
   +  });
   +});
   ```

2. **Remove any copied batch-cache wiring.** If your fork attached
   `batchCache()` to a route or called `entityCache.reserveBatch` /
   `resolveBatchToken`, delete it — those exports are gone.

3. **Audit seq indexes (recommended, related follow-up).** The upstream removal
   is paired with a `seq`-index push (see
   [.todos/SYNC_FANOUT_OPTIMIZATION.md](../../../.todos/SYNC_FANOUT_OPTIMIZATION.md)).
   Confirm every product-entity table has a `(<channel-or-org-id>, seq)` index —
   both raak and projectcampus were missing it on `attachments`.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
```

`pnpm ts` fails until every 4-arg `deltaFetch` is fixed (arity/type mismatch),
which is how you find any site the grep missed.
