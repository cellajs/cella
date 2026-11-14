---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: tenantReadAs, tenantReadAsIncludingDeleted, tenantReadUnlessInTransaction, tenantReadIncludingDeleted, tenantContextIncludingDeleted
roots: backend/src, backend/tests
---

# Tenant transactions take a tenant and tombstones as options

`backend/src/db/tenant-context.ts` keeps `tenantRead`, `tenantContext`, `tenantReadById` and `tenantContextById`. An
app rewrites `tenantReadAs(ctx, id, fn)` to `tenantRead(ctx, fn, { tenantId: id })`, an `IncludingDeleted` variant to
the base call with `{ includeDeleted: true }`, and `tenantReadUnlessInTransaction(ctx, fn)` to `tenantRead(ctx, fn)`.

## What & why

Nine exports covered three axes (tenant, tombstones, read or write), so a new combination meant a new name. The two
request helpers now take `{ tenantId?, includeDeleted? }`. `tenantReadUnlessInTransaction` only skipped the savepoint
that `tenantRead` opens inside a tenant transaction of the same tenant, so its callers read in that savepoint now.

## Blast radius

Every app module that calls one of the five removed names, typically a product module copied from attachment. No
database, wire-shape or `clientCacheVersion` change.

## Run

The codemod rewrites each call, on one line or many, and a `const read = range ? tenantReadIncludingDeleted : tenantRead`
selection, which becomes `{ includeDeleted: !!range }` on each `read` call. Any other use of a removed name, such as a
mock, is reported for a hand rewrite.

```sh
pnpm cella align --run 20261113T2237-tenant-context-options                                       # report only
pnpm cella align --run 20261113T2237-tenant-context-options -- rewrite backend/src backend/tests   # apply
```

## Manual steps

1. Rewrite each use the codemod reports: the callback moves to the second argument and the tenant id or `includeDeleted` into the options object after it.
2. A test that mocks `tenantReadUnlessInTransaction` mocks `tenantRead` in its place.

## Verify

```sh
pnpm lint:fix
pnpm check
```
