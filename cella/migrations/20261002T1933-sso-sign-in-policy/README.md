---
syncBreaking: false
clientCacheBump: false
---

# SSO surfaces: the tenant sign-in policy, the entry page and the institution buttons

`tenantGuard` now enforces `tenants.authStrategies`: a member who holds an identity through the tenant's connection
must act with an allowed method, else 403 `sso_required` (with `meta.connectionId` and `meta.entryPath`); delegated
tokens carry the consenting session's `auth_strategy` and `connection_id`, stamped on the grant. Magic links to an
address a federation proved answer `sso_required` while the tenant excludes `magic`. New surfaces: the entry route
`/auth/sso/$connectionId`, institution buttons on the authenticate page (`GET /auth/health` gains `federations`, the
invitation token data `ssoConnectionId`), institution accounts on the account page (`GET /me/auth` gains
`institutions`), and the connections card plus the allowed-methods editor in the system tenant sheet.

## What & why

The second half of institutional sign-in: what people see and what a tenant can require. `UserActor` gains optional
`authStrategy` and `connectionId`, set by `userGuard` from the session and by `serviceGuard` from the token claims.
Nothing changes for a tenant whose `authStrategies` stays empty.

## Blast radius

Not sync-breaking: every API change is additive (`federations`, `ssoConnectionId`, `institutions`, two token claims)
and the guard refuses only under a policy no tenant has set yet. An app that copied `mockMeAuthResponse` or
`tenantRow` test fixtures adds the new fields. No schema change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `pnpm sdk` and, for an app with its own `routeTree`, `pnpm generate:routes`; add the `sso_required` and `c:sso_*` / `c:connection*` / `c:institution*` locale keys if the app keeps its own locale files.
2. An app with a custom error boundary that should offer the institution's entry on `sso_required` reads `error.meta.connectionId` as `ErrorNotice` does.

## Verify

```sh
pnpm --filter backend test
pnpm check
```
