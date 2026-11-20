---
breaking: true
clientCacheBump: true
caughtBy: nothing
generate: true
grep: quotas, rateLimits, apiPointsPerHour, invitationEmailsPerDay, getPointsBudget, allowUnregisteredClients, publicCounts, getPublicCounts, jitProvisioning, scopes, ctx.var.memberships, has.uploads, has.waitlist
---

# Deny by default

`appConfig.defaultRestrictions` names a cap for every quota key and takes `allowUnregisteredClients`, `has` takes
`publicCounts`, and a cap of `0` allows none where `'unlimited'` lifts it. An API key states its `scopes`, `'all'` or a
list, and a rolled key keeps those of the key it replaces. `connections.jitProvisioning` defaults to false. The
upload token and waitlist entries answer 404 while `has.uploads` or `has.waitlist` is off, and public counts while
`has.publicCounts` is. On a user-level route, `actor.bindings` leaves out a tenant whose sign-in policy refuses the
session, where `ctx.var.memberships` keeps every row.

## What & why

An omitted value granted access: a key without scopes acted with its account's full grants, and a roll dropped the
scopes of the key it replaced. A missing quota and a cap of `0` meant unlimited, every tenant accepted unregistered
OAuth clients, an SSO connection admitted the institution, and three `has` flags turned off only the UI. Each now
denies until something states the grant.

## Blast radius

Every app: config keys the compiler asks for, one migration, and caps of `0` that change meaning unnoticed. Apps
with their own limiters, quota checks or API key clients have code to read. `clientCacheVersion` rises. Database
TLS now follows `appConfig.isDeployed`, so staging requires `DATABASE_SSL_CA` too.

## Run

No script: manual.

## Manual steps

1. Caught by the compiler. In the app's `config.default.ts`, give `defaultRestrictions.quotas` a cap for every entity type and for `serviceAccount`, `apiKey` and `ltiConnection`, add `defaultRestrictions.allowUnregisteredClients` and add `has.publicCounts`.
2. Not caught. Where the config, a `tenantKinds` restriction or app code sets a quota or a rate limit to `0` to lift it, write `'unlimited'`; where app code compares one with `0` for "no cap", compare with `'unlimited'`.
3. Not caught. Give a custom limiter's `getPointsBudget` a return of `null` where it answered `0` for no tenant budget.
4. Caught by the compiler for SDK calls. Pass `scopes` (`'all'` or a list) wherever the app creates an API key or a service account with one; a raw client sends it too.
5. Not caught. Turn on `has.publicCounts` if the app shows the counts, and `defaultRestrictions.allowUnregisteredClients` if its tenants connect AI clients by Client ID Metadata Document.
6. Not caught. Run `pnpm generate`: the migration sets the `connections.jit_provisioning` default to false. An SSO connection created without `jitProvisioning` now admits invited addresses only.
7. Not caught. Where app code decides about other people or a tenant's content from `ctx.var.memberships` on a user-level route, read `accessFrom(ctx)` or `actor.bindings`.

## Verify

Try a tenant whose sign-in policy requires SSO with a session from another method: its people stay out of the user list. Then run:

```sh
pnpm generate
pnpm check
```
