---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: app-product-cache, loadTenantCache, invalidateTenantCache, PermissionResult, BatchPermissionResult
---

# The detail cache's store is productCacheStore

The store `productCache` in `middlewares/product-cache/app-product-cache` is `productCacheStore` in
`middlewares/product-cache/product-cache-store`; the `productCache` middleware and the barrel keep their names and
path. The guard caches read and drop as pairs: `loadTenantCache` is `loadCachedTenant`, `invalidateTenantCache` is
`dropCachedTenant`. The permissions barrel no longer re-exports its types.

## What & why

Two exports were named `productCache`: the store and the middleware. The store now says what it is, and each guard
cache is a `loadCachedX` and `dropCachedX` pair, as the session cache is.

## Blast radius

App-owned code that imports the store by its old path or name (projectcampus `tests/product-write-dispatch.test.ts`),
one of the old cache names, or a type through `#/permissions`. Synced files arrive with the sync. No database, lens or
`clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Import `productCacheStore` from `#/middlewares/product-cache/product-cache-store` where app code used the store.
2. Rename `loadTenantCache` and `invalidateTenantCache` calls in app-owned code to `loadCachedTenant` and `dropCachedTenant`.
3. Import permission types from the file that declares them, not from `#/permissions`.

## Verify

```sh
pnpm check
```
