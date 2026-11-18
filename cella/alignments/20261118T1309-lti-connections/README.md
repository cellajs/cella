---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Connections and tokens take an LTI kind

An app adds `'lti-registration'` to `tokenKinds` in its `config.default.ts` and runs `pnpm generate`. Code of its own
that reads `connection.federation` handles null, a map keyed by `BaseAuthStrategies` adds `lti`, and a call that passes
a `TokenKind` to `readBoundToken`, `findLiveBoundToken` or `spendCookieToken` passes an `AddressedTokenKind`.

## What & why

The app registers as an LTI tool at a platform by a one-use link. `connections` takes kind `lti` with `issuer` and
`clientId`, and `federation` becomes nullable. A token row carries `email` or `tenantId`, exactly one: the
registration link carries the tenant. `enabledAuthStrategies` may name `lti`, refused at config load without `services.oauth`.

## Blast radius

Every app: the template code names the new token kind, and the schema changes need a migration. No lens or
`clientCacheVersion` change. An app that never reads connections or tokens itself has only the config line and the
migration to do.

## Run

No script: manual.

## Manual steps

1. Add `'lti-registration'` to `tokenKinds` in `shared/config/config.default.ts`.
2. Run `pnpm generate`: it adds the columns, check constraints and indexes, and needs no hints or hand-written SQL.
3. Fix what the typecheck reports in app-owned code.

## Verify

```sh
pnpm generate
pnpm check
```
