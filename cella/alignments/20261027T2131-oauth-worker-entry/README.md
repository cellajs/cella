---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: startOauthServer, createTenantForUser, tenant-service, tenants/operations/load-tenant
---

# The authorization server's entry is startOauthWorker

`startOauthServer` is `startOauthWorker`, `createTenantForUser(db, ...)` in `tenants/tenant-service.ts` is
`createTenant(ctx, ...)` in `tenants/operations/create-tenant.ts`, and `loadTenant` moved to `tenants/load-tenant.ts`.
An app that still carries `backend/src/main.oauth.ts` (removed upstream with the single migration sequence) deletes it.

## What & why

The process entries follow one name, `start<Name>Worker`, and the tenants module keeps what handlers run in
`operations/` and what other modules call at its root.

## Blast radius

Synced files arrive with the sync. App-owned code that imports one of the old names or paths fails typecheck; in
the known apps only the leftover `main.oauth.ts` does. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Delete `backend/src/main.oauth.ts` if it is still there.
2. Point app-owned imports of `startOauthServer`, `createTenantForUser` or `tenants/operations/load-tenant` at the new names and paths.

## Verify

```sh
pnpm check
```
