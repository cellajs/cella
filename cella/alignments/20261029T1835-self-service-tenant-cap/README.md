---
breaking: true
clientCacheBump: false
caughtBy: compiler
---

# A cap on the tenants one user creates

An app adds `selfServiceTenantsPerUser: 10` to its `shared/config/config.default.ts`, beside `defaultRestrictions`:
`selfCreateTenant` refuses a user who is not a system admin with 403 `restrict_by_app` once they created that many
tenants, and `0` turns self-service creation off. A user also keeps at most 20 push subscriptions, registered at most
30 times an hour.

## What & why

`POST /tenants/self` had no count: one session created about 1000 tenant and organization pairs an hour, each with a
global organization slug, a membership and a security-inbox mail. The count and the insert now run under a lock per
user, so a parallel burst cannot pass the cap together. `createPushSubscription` stored a row per new endpoint path
without limit.

## Blast radius

Every app's config: typecheck asks for the key. No database, lens or cache change. An app whose users create more than
10 workspaces each sets a higher number.

## Run

No script: manual.

## Manual steps

1. Add `selfServiceTenantsPerUser` to `shared/config/config.default.ts`, with the template's value or the app's own.
2. An app route that writes, or takes anonymous requests, declares `xRateLimiter`, or goes into `routesWithoutLimiter` in `backend/tests/security/route-guards.test.ts` with what bounds its cost.

## Verify

```sh
pnpm check
pnpm --filter backend exec vitest run tests/security/route-guards.test.ts
```
