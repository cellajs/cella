---
syncBreaking: true
clientCacheBump: true
---

# Institutional sign-in: federations, connections, the domains module removed

Institutions sign in through an identity federation (`sso`): `appConfig.federations` declares them (the cella default
declares `surfconext`, the template `{}`), `enabledAuthStrategies` gains `'sso'`, and `SSO_<KEY>_CLIENT_ID` /
`SSO_<KEY>_CLIENT_SECRET` hold the client per federation. A tenant trusts an institution through the new `connections`
table (`backend/src/modules/connections/`), which replaces the `domains` module: its table, routes, the tenant
`domainsCount` and the frontend domains sheet are gone. `backend/src/modules/auth/sso/` adds the entry, start and
callback routes under `/auth/sso/`; `identities.connectionId` becomes a uuid foreign key, `tokens.connectionId` and the
foreign keys on `sessions` and `identities` arrive. `pnpm generate` emits all of it.

## What & why

SURFconext sign-in needs a per-tenant institution record and a federation registry; `domains` (DNS-verified email
domains, never read by auth) had the same shape and no caller, so `connections` takes its place. The strategy enum
and labels now derive from `appConfig.federations`; `EmailProof` and the OAuth state cookie accept federation keys.

## Blast radius

Sync-breaking: `RequiredConfig` requires `federations`, `BaseAuthStrategies` has `sso`, the `domains` module and
`Tenant.domainsCount` are gone (TypeScript names every caller). One schema migration (table create, table drop, a
column type change, three foreign keys). `clientCacheVersion` bumps to `v11-sso-connections`: the domains routes and
`Tenant.domainsCount` leave the API, which the breaking-change gate reads as a client cache bust.

## Run

No script: manual.

## Manual steps

1. Add `federations` to `shared/config/config.default.ts` (`{}` to opt out; copy cella's `surfconext` entry to opt in) and, when opting in, `'sso'` to `enabledAuthStrategies`, the test issuer override to the mode configs and the two env variables to `.env.example`.
2. `pnpm --filter backend generate` emits `connections`, `DROP TABLE domains`, `tokens.connection_id`, `identities.connection_id` as uuid (with the `USING` cast) and the foreign keys; commit the folder. An app that stored data in `domains` exports it first.
3. Remove app code that imported `#/modules/domains/*`, `domainsQueryOptions` or read `tenant.domainsCount`; the system tenants table and the tenant edit sheet no longer show domains.
4. An app with its own `strategyLabels` or `authStrategiesEnum` copies derives them from `appConfig.federations` as cella does; locale keys `sso_*` in `error.json` are new.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm --filter backend test
pnpm check
```
