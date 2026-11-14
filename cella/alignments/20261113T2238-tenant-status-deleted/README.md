---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: archivedTenantDays, 'archived'
generate: true
---

# A deleted organization's tenant has status deleted

Every app renames `retention.archivedTenantDays` to `deletedTenantDays` in `shared/config/config.default.ts`, replaces
the tenant status `'archived'` with `'deleted'` in its own code, runs `pnpm generate` and adds `data.sql` to the
migration. `updateTenant` now takes `by` and stamps `updatedAt`, `updatedBy` and `statusChangedAt` itself.

## What & why

"Archived" named two lifecycles: a channel closed to writes and a tenant on its way to removal. The tenant's is now
`deleted` (`tenantStatusValues`), its period `retention.deletedTenantDays`, and `markTenantDeleted` is the one
operation both an organization's deletion and an account deletion call. The last-admin trigger exempts a `deleted`
tenant. The tenant-removed mail's static is `deletedAt`.

## Blast radius

Every app for the config key, the data move and the trigger. App code that writes or compares `'archived'` on a
tenant, or calls `updateTenant` with stamps, fails to compile; raw SQL naming the status does not. Channels keep their
`archived` boolean. No cache bump: tenants are no synced entity.

## Run

No script: manual.

## Manual steps

1. Rename `archivedTenantDays` to `deletedTenantDays` in `retention` of `shared/config/config.default.ts`.
2. Replace `'archived'` with `'deleted'` wherever app code reads or writes `tenants.status`, raw SQL included.
3. Pass `by` to `updateTenant` and drop `statusChangedAt` and `updateStamps(...)` from its `values`.
4. Run `pnpm generate`, then paste `data.sql` at the top of the generated migration: without it an archived tenant is never removed and its admin can no longer leave it. `hints.json` is empty.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```

After migrating, `SELECT count(*) FROM tenants WHERE status = 'archived'` answers 0.
