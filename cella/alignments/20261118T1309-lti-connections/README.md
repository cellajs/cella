---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Connections and tokens take an LTI kind

An app adds `'lti-registration'` and `'lti-tool-registration'` to `tokenKinds` and `ltiPlatform: false` to `has` in its
`config.default.ts`, and runs `pnpm generate`. Code of its own that reads `connection.federation` handles null, a map
keyed by `BaseAuthStrategies` adds `lti`, a switch over a service account's `status` handles `pending`, and a call that
passes a `TokenKind` to `readBoundToken`, `findLiveBoundToken` or `spendCookieToken` passes an `AddressedTokenKind`.

## What & why

The app registers as an LTI tool at a platform by a one-use link. `connections` takes kind `lti` with `issuer` and
`clientId`, and `federation` becomes nullable. A token row carries `email` or `tenantId`, exactly one: the
registration link carries the tenant. `enabledAuthStrategies` may name `lti`, refused at config load without `services.oauth`.

As an LTI platform (`has.ltiPlatform`, refused at config load without `services.oauth`), the app takes an LTI tool's
registration with a one-use token. The registration is an `oauth_clients` row with LTI columns, private to a tenant,
which the provider and the grant policy never read. Its installation is a service account, `pending` until an admin
approves it, with a row in the new `lti_installations` table.

## Blast radius

Every app: the template code names the new token kinds, and the schema changes need a migration. No lens or
`clientCacheVersion` change. An app that never reads connections, tokens or service accounts itself has only the config
lines and the migration to do.

## Run

No script: manual.

## Manual steps

1. Add `'lti-registration'` and `'lti-tool-registration'` to `tokenKinds` in `shared/config/config.default.ts`.
2. Add `ltiPlatform: false` to `has` in the same file.
3. Run `pnpm generate`: it adds the columns, the `lti_installations` table, check constraints, indexes and grants, and
   needs no hints or hand-written SQL.
4. Fix what the typecheck reports in app-owned code.

## Verify

```sh
pnpm generate
pnpm check
```
