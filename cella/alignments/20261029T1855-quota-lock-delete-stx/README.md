---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: assertTenantQuota, countTenantEntityRows, deleteStamps
---

# Product creates check the quota under a lock, deletes store their stx

Each app product create that checks a tenant quota runs its insert through `insertWithinTenantQuota(txCtx, entityType,
insert)` (`#/modules/tenants/quota-lock`) in place of `countTenantEntityRows` plus `assertTenantQuota` before the
transaction, and each app product soft delete stores its own `stx` ids with `stripChangedFields(table.stx, stx)` beside
`deleteStamps`.

## What & why

A create counted the tenant's rows in its own read and inserted in a later transaction, so concurrent requests, even
from one member, all passed one free slot. The helper takes a Postgres lock per tenant and entity type and counts after
the insert. A soft delete kept the last writer's `stx`: that writer's tab took the delete for its own echo and kept the
row, and the CDC worker recorded the delete as that writer's edit.

## Blast radius

Every app product module copied from the attachment module: until it follows, its creates can pass the quota and its
deletes keep the previous writer's `stx`. No database, lens or `clientCacheVersion` change. Service account and API key
quotas are unchanged.

## Run

No script: manual.

## Manual steps

1. In each app create that calls `assertTenantQuota` for a product, drop that call and its `countTenantEntityRows`, and wrap the insert inside the `tenantContext` as `insertWithinTenantQuota(txCtx, '<entityType>', () => insert<Name>s(txCtx, …))`, as `create-attachments.ts` does.
2. In each app `<module>-queries.ts` soft delete, set `stx: stripChangedFields(<table>.stx, stx)` beside `...deleteStamps(actorId)`, with `stx` taken from the delete body in the handler and defaulting to `createServerStx()` in the operation, as `delete-attachments.ts` does.

## Verify

```sh
pnpm check
pnpm test
```

Then send ten creates at once against a tenant one row under its quota: exactly one answers 201.
