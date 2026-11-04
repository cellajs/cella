---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: productCache, productCacheData, productCacheStore, xCache, holdForWrite, invalidateProduct, isInFlight, onDispose, X-Cache
---

# The product detail cache is gone

`backend/src/middlewares/product-cache/` is removed with `productCache`, `productCacheStore` and the `productCacheData` context variable, and so are the `xCache` route prop with its `x-cache` extension, `isInFlight` in `utils/request-coalescing.ts` and the `onDispose` option of `TTLCache`. A product detail route lists no `xCache` and its handler sets no `productCacheData`; every detail read runs its handler.

## What & why

The cache served a cold route: clients seed details from synced list rows. Keeping 10 seconds of it correct took a read-in-flight guard, a write hold in `dispatchMutation`, a drop on every CDC product message, request coalescing and a copy of `getValidProduct`'s read rule. The `detail-read` bench scenario, 300 readers of one attachment at once, ran at p95 96 to 227 ms without it on a local database, where the database took about 15% of a read and never saturated.

## Blast radius

Breaking for every app product route that registers `productCache` and every handler that sets `productCacheData`, and for app tests that read `X-Cache` or clear `productCacheStore`. No database, lens or cache-version change.

## Run

No script: manual.

## Manual steps

1. raak: in `backend/src/modules/label/label-routes.ts` and `task/task-routes.ts` drop `xCache: [productCache('<type>')]` and the `productCache` import; in `label-handlers.ts` and `task-handlers.ts` drop `ctx.set('productCacheData', result)`.
2. projectcampus: the same in `backend/src/modules/{comment,item,label,material}/*-routes.ts` and `*-handlers.ts`; the four route `description` sentences that promise the detail cache go with them.
3. projectcampus `backend/tests/product-write-dispatch.test.ts`: drop the `X-Cache` assertions and the `productCacheStore` calls, keeping what it asserts about the row a read returns. `backend/tests/security/cross-org-app.test.ts:124-139` asserts `X-Cache` MISS then HIT on four products: it still compiles and fails at run time; drop the header assertions and keep the cross-organization refusals.
4. A `TTLCache` built with `onDispose` logs at its own call site.

## Verify

```sh
pnpm check
```
