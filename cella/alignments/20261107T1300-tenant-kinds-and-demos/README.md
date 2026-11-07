---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: removeArchivedTenants, archived-tenants-removal, countEntityRows, findArchivedTenants, deleteArchivedTenant, tenants.kind, expires_at
generate: true
---

# Tenants get a kind and an expiry; demos arrive

`tenants.kind` (`live`, `test`, `demo`) and `tenants.expires_at` are new columns, so `pnpm generate` is owed. The app's
`shared/config/config.default.ts` gains `tenantKinds`, `demo`, `retention.demoTenantDays` and `has.demos`, which the
config type asks for. The archived-tenant sweep is now `removeDueTenants` on the job `tenants-removal`, and
`countEntityRows` split into `countChannelRows` and `countPublicUsers`.

## What & why

Test tenants (the showcase seed, e2e and pentest runs, staff trying a flow) polluted the public counts and the admin
lists, and an app wanting a demo had to fork the sign-in strategies, the public counts and the tenant creation. The
kind now drives lists, counts, invitations, operator notices and restrictions from config; a demo is a `demo` tenant with
a `demo` session, taken through `createDemo` (`POST /demos`) while `has.demos` is on, filled by `onDemoCreated` hooks
and removed after `retention.demoTenantDays` with its account.

## Blast radius

Every app: the config keys are required and `backend/drizzle` is app-owned. No wire shape changed its type, so no
`clientCacheVersion` bump; `Tenant` gains `kind` and `expiresAt`, list queries gain optional `kind` and
`includeProvisional`. An app that never customized tenants, counts or the sweep needs the config keys and the migration
only. The showcase seed marks its tenants `test`.

## Run

No script: manual.

## Manual steps

1. Add `tenantKinds`, `demo`, `retention.demoTenantDays` and `has.demos` to `shared/config/config.default.ts` as the template's file has them; an app with its own demo keeps `has.demos: false` until it adopts `createDemo`.
2. Run `pnpm generate`. It produces two `ADD COLUMN` on `tenants` (`kind` with default `'live'`, `expires_at`), two indexes and the check `tenants_demo_expires_check`; every existing row is `live`. No rename hints and no hand-written SQL.
3. Rename an app call of `removeArchivedTenants`, `findArchivedTenants` or `deleteArchivedTenant` to `removeDueTenants`, `findDueTenants` or `deleteDueTenant`, whose condition takes `{ archivedBefore, now }`.
4. An app seed that inserts tenants for shots or tests sets `kind: 'test'`; an app with its own demo tenants sets `kind: 'demo'` and `expiresAt` on them, and maps its sessions' `auth_strategy` to `demo` in a data migration.
5. An app that fills demos declares `onDemoCreated` in its `defineBackendModule`; its own public demo route goes, `createDemo` answers in its place.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
