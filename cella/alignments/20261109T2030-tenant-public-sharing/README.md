---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: tenantKinds
---

# Tenant kinds declare `publicSharing`

Add `publicSharing` to every kind in `tenantKinds` of `shared/config/config.default.ts`: `true` for `live` and `test`,
`false` for `demo`. An app with public entities calls `assertTenantPublicSharing` where a row turns public and filters
its public reads on `publiclyServedTenant`.

## What & why

`TenantKindConfig` requires `publicSharing`. A demo shares nothing with the public: `servesPublicly` refuses a public
read of a tenant that is inactive, past `expiresAt` or of a kind without sharing. `assertTenantPublicSharing` and
`publiclyServedTenant` carry the same rule for an app's own public routes.

## Blast radius

Every app: the config type requires the key. An app that declares no `publicRead` only adds the key. No wire, cache or
schema change.

## Run

No script: manual.

## Manual steps

1. Add `publicSharing` to each kind in `tenantKinds`, as the template's `shared/config/config.default.ts` has it.
2. Where the app's own route turns a row public, call `assertTenantPublicSharing(ctx.var.tenant)`.
3. Add `publiclyServedTenant(table.tenantId)` to the `where` of each public read the app serves outside `tenantGuard`.

## Verify

```sh
pnpm check
```
