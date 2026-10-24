---
syncBreaking: true
clientCacheBump: false
---

# Deleting an organization archives its tenant; archived tenants go after archivedTenantDays

`pnpm generate` adds `tenants.status_changed_at`. App tests, seeds and flows that expect an organization row to vanish
on `deleteOrganizations` see its tenant archived; the row goes with the nightly `archived-tenants-removal` job. App
handlers of `organization.deleted` no longer run on an admin's delete.

## What & why

`deleteOrganizationsOp` archives the tenant: `loadMemberships` and the organization list leave out archived tenants,
the members' bindings versions move and their streams end with `access_changed`. A system admin restores the tenant by
setting it active. `removeArchivedTenants` deletes tenants archived longer than `appConfig.retention.archivedTenantDays`
(the deletion queue clears their files) and mails `appConfig.company.email` the counts, the written record of destruction.

## Blast radius

Every app with code or tests around organization deletion, or a handler of `organization.deleted`. A database migration;
no client cache bump (the tenant schema only gains a field). Apps that never customized deletion are unaffected.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; it adds `status_changed_at` with the current time for existing tenants.
2. In app tests that assert an organization is gone after `deleteOrganizations`, assert its tenant's `status` is `archived`.
3. Move side effects of an app's `organization.deleted` handler to the deletion queue (`storage-columns.ts`) or the sweep; the sweep deletes by SQL and dispatches no mutation.
4. Set `retention.archivedTenantDays` in the app's config if its agreements promise another period, and match the terms text.

## Verify

```sh
pnpm generate
pnpm --filter backend test
pnpm check
```
