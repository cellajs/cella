# service accounts and API keys: the first machine principal

## What & why

Two new tables, `service_accounts` (a machine principal: tenant-scoped, role bindings in `grants`, disabled never
deleted) and `credentials` (opaque API keys, hash only, `scopes` mask). `machineGuard` authenticates
`Authorization: Bearer <app>_sk_live_…` (or `x-api-key`) as that account; `actorGuard` accepts a session or a key on
routes whose operations take `ActorContext`. Scopes are derived from the policy matrix (`scopes` next to
`policyMatrix`, `<entityType>:read|write`) and applied as a mask in `checkAccess*` and collection reads. The points
limiter keys on `(tenantId, principalId)`; CSRF is skipped for requests carrying a machine credential. AUTH_SUBSTRATE_PLAN Phase B.

## Blast radius

Database change (two tables, tenant `restrictions` default gains `serviceAccount` and `credential` quotas), not
sync-breaking, no cache bump. API adds the `service-accounts` module and an `apiKey` security scheme. Apps whose
`permissions-config.ts` destructures `configurePermissions(...)` gain a `scopes` export for free. Apps with their own
route files choose per route whether to accept keys (`actorGuard`) or stay session-only (`authGuard`).

## Run

No script: manual.

```sh
pnpm generate
pnpm sdk
```

## Manual steps

1. Add `'service_accounts'` and `'credentials'` to `fullCrudTables` in `backend/scripts/migrations/10-rls.migration.ts` if the app pins that file (they are auth tables, not RLS tables).
2. Add `credentials, service_accounts` to test `TRUNCATE` lists that include `users`.
3. Routes a machine may call: switch `xGuard: [authGuard, ...]` to `[actorGuard, ...]` on routes whose operations are typed `ActorContext`. Never on a route whose operation reads `ctx.var.user`.
4. Hand-built contexts in tests (`{ var: { memberships } }`) also need `actor: { kind: 'user', id, grants: memberships, scopes: null, credential: { kind: 'session', id } }`; guards read `actor.grants`.
5. App quotas: `defaultRestrictions.quotas` may set `serviceAccount` and `credential` (0 = unlimited; template defaults 20 and 100).
6. Rate limiters keyed on `'userId'` keep working for sessions; use `'principalId'` for limits that must also cover keys.

## Verify

```sh
grep -rn "xGuard: \[authGuard" backend/src/modules/<your-product>/*-routes.ts
pnpm generate
pnpm sdk
pnpm check
```
