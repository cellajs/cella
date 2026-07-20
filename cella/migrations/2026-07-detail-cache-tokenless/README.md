# Tokenless detail cache migration

Removes the single-entity **cache token** from the detail cache. The `appCache` middleware no longer validates a session-signed `X-Cache-Token`; it keys the cache by `entityType:{id}` from the request path and **re-authorizes each cache hit** with `checkPermission` against the cached row (live authorization). CDC invalidates entries by entity id. The `cacheToken` field is gone from the entire CDC → SSE → client pipeline. Upstream cella arrives already migrated; run the same edits on fork-specific code.

Pairs with [2026-07-batch-cache-removal](../2026-07-batch-cache-removal/) (the batch side). If you pull both together, do that migration's steps too.

## What forks must do

Manual, no script (the surface is small — one edit per product detail route plus the frontend header removal).

1. **`appCache()` → `appCache(entityType)` on every product detail route.** Find them:

   ```sh
   grep -rn "appCache(" backend/src
   ```

   Pass the route's product entity type, e.g. `xCache: [appCache('task')]`. Base cella has 1 (attachment); **raak** has 3 (attachment/task/label), **projectcampus** has 1 (attachment). `pnpm ts` fails on any you miss (missing required argument).

2. **Drop the `X-Cache-Token` send + token store on the frontend.** Find them:

   ```sh
   grep -rn "getCacheToken\|X-Cache-Token\|cache-token-store\|storeEntityCacheToken" frontend/src
   ```

   Remove the header from detail `queryFn`s and delete any local `cache-token-store` usage — the list/detail endpoints no longer read the header.

3. **Remove any copied token machinery.** If a fork referenced `signCacheToken` / `validateSignedCacheToken` (deleted `middlewares/entity-cache/token-signer.ts`), `entityCache.reserve`/`resolveToken`, or added `cacheToken` to a custom product notification schema, delete those — the field is gone from `stream-schemas` and the CDC wire.

4. **Verify custom read rules still authorize from cached data.** Cache hits now re-run `checkPermission` against the _cached enriched response_ (with `createdBy` normalized back to the raw id). If your fork added product read conditions in the config, confirm your detail response carries the fields the check needs (channel ids, `createdBy`, `publicAt`, `publishedAt`) — attachments and the standard product columns already do.

   > **Imperative rules do NOT re-run on cache hits.** A product rule written directly into `canReceiveEntityEvent` (rather than expressed as config or a lifecycle column) is invisible to the cache path — a cache hit would serve rows your dispatch withholds. Author-only drafts specifically are covered upstream by [2026-07-published-rows](../2026-07-published-rows/) (`publishedAt` lifecycle; the cache applies the same veto). Migrate `draft`-style rules to it before adopting step 5 on those routes; any remaining imperative rule must be added to `callerCanRead` (`entity-cache/presets.ts`) as well.

5. **(Optional, projectcampus) adopt `appCache` on the uncached detail routes.** Only `attachment` is cached today; extend `xCache: [appCache('<type>')]` to `item/label/material/comment/submission` detail GETs to get the same detail cache the base ships for attachments — after the step-4 caveat is resolved for each route's read rules.

## Gates

```sh
pnpm exec biome check --write .
pnpm ts
pnpm sdk   # regen: drops cacheToken from the generated types
```
