---
breaking: true
clientCacheBump: false
caughtBy: nothing
generate: true
grep: tenantsTable, TenantModel, normalizeRestrictions, allowUnregisteredClients
---

# Tenant restrictions default

The `tenants.restrictions` column defaults to `{}`, which every read lays over the running `appConfig.defaultRestrictions`,
and `pnpm generate` writes the migration that sets it. `TenantModel` carries the restrictions as read; a row selected
from `tenantsTable` holds the stored merge patch. A tenant that exists keeps what it stores: one created on an earlier
default allows unregistered OAuth clients until a system admin turns that off.

## What & why

The column default was `defaultRestrictions()`, and `pnpm generate` froze it into a migration in the mode it ran in. The
development config allows unregistered OAuth clients. A new production tenant stored `true` against a config that says
`false`, and a cap changed in the config never reached a new tenant.

## Blast radius

Every app: one migration, and tenants created on an earlier default that may allow unregistered clients against the
config. App code that selects `tenants.restrictions` itself gets the stored patch.

## Run

No script: manual.

## Manual steps

1. Not caught. Run `pnpm generate`: the migration sets the `tenants.restrictions` default to `{}`. A new tenant then follows the config of the mode the app runs in.
2. Not caught. List the tenants that allow unregistered clients with `SELECT id, name FROM tenants WHERE restrictions ->> 'allowUnregisteredClients' = 'true'`. For each that should follow the config, a system admin sends `PATCH /tenants/{tenantId}` with `{"restrictions": {"allowUnregisteredClients": null}}`.
3. Caught by the compiler. Where app code reads `restrictions` from a row it selects or inserts in `tenantsTable` itself, pass it through `normalizeRestrictions`.

## Verify

Create a tenant and read it back: its `restrictions` equal the config's `defaultRestrictions` in the mode the app runs in. Then run:

```sh
pnpm generate
pnpm check
```
