---
breaking: true
clientCacheBump: false
caughtBy: nothing
generate: true
grep: tenantsTable, TenantModel, normalizeRestrictions, kindRestrictions, allowUnregisteredClients, tenantKinds
---

# Tenant restrictions default

`tenants.restrictions` stores a merge patch that every read lays over the running `appConfig.defaultRestrictions`: its
column default is `{}`, a new tenant stores its kind's patch (`kindRestrictionsPatch`) and an update merges onto the
stored patch. `TenantModel` carries the restrictions as read; a row selected from `tenantsTable` holds the patch. A
tenant that exists keeps the caps and the permission an earlier default stored, until a system admin resets them.

## What & why

The column default was `defaultRestrictions()`, and `pnpm generate` froze it into a migration in the mode it ran in. The
development config allows unregistered OAuth clients. A new production tenant stored `true` against a config that says
`false`, a cap changed in the config never reached a new tenant, and an update stored the whole config again.

## Blast radius

Every app: one migration with a data step, tenants that may allow unregistered clients against the config, and test
tenants that read the app's own test config. App code that selects `tenants.restrictions` itself gets the stored patch.

## Run

No script: manual.

## Manual steps

1. Not caught. Run `pnpm generate`, which sets the `tenants.restrictions` default to `{}`, and add `data.sql` to that migration as its first comment says: a cap of `0` stored before cella#1888 meant unlimited, and an entity type the config named no cap for was stored as `0` on every tenant.
2. Not caught. A tenant that exists keeps the caps and the permission it stores. `PATCH /tenants/{tenantId}` with `{"restrictions": {"quotas": null, "rateLimits": null, "allowUnregisteredClients": null}}` makes it follow the config entirely, and `SELECT id, name FROM tenants WHERE restrictions ->> 'allowUnregisteredClients' = 'true'` lists the tenants that store the permission.
3. Not caught. An app's test tenants now read its own test config: where that keeps `defaultRestrictions.allowUnregisteredClients` or `has.waitlist` off, turn both on in `config.test.ts`, or the template's tests of unregistered OAuth clients and of the waitlist fail. The template's `config.development.ts` sets both, and its test mode extends it.
4. Not caught. A self-created tenant now stores `tenantKinds.live.restrictions`, which `createTenant` left out: read that patch where the app sets one.
5. Caught by the compiler. `kindRestrictions` is `kindRestrictionsPatch` and returns the patch alone. Where app code reads `restrictions` from a row it selects or inserts in `tenantsTable` itself, pass it through `normalizeRestrictions`.

## Verify

Create a tenant, update one of its caps and read it back: its other restrictions equal the config's `defaultRestrictions` in the mode the app runs in. Then run:

```sh
pnpm generate
pnpm check
```
