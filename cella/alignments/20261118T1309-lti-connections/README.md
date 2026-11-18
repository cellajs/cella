---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# Connections and tokens take an LTI kind

An app adds `'lti-registration'`, `'lti-tool-registration'` and `'lti-launch'` to `tokenKinds` and `ltiPlatform: false`
to `has` in its `config.default.ts`, adopts the pinned `launch-context.ts`, and runs `pnpm generate`. Code of its own
that reads `connection.federation` handles null, a map keyed by `BaseAuthStrategies` adds `lti`, a switch over a service
account's `status` handles `pending`, and a call that passes a `TokenKind` to `readBoundToken`, `findLiveBoundToken` or
`spendCookieToken` passes an `AddressedTokenKind`.

## What & why

The app registers as an LTI tool at a platform by a one-use link. `connections` takes kind `lti` with `issuer` and
`clientId`, and `federation` becomes nullable. A token row carries `email` or `tenantId`, exactly one: the
registration link carries the tenant. `enabledAuthStrategies` may name `lti`, refused at config load without `services.oauth`.

As an LTI platform (`has.ltiPlatform`, refused at config load without `services.oauth`), the app takes an LTI tool's
registration with a one-use token. The registration is an `oauth_clients` row with LTI columns, private to a tenant,
which the provider and the grant policy never read. Its installation is a service account, `pending` until an admin
approves it, with a row in the new `lti_installations` table.

A resource link places an approved installation in a channel (the new `lti_resource_links` table) and shows as a tab of
that channel. A launch is a one-use `lti-launch` token, which names its resource link in the new `tokens` column
`lti_resource_link_id`. Which channels are LTI contexts and which LTI roles an app role sends are the app's call, in the
pinned `backend/src/modules/lti-platform/launch-context.ts`. The frontend CSP allows HTTPS frames while
`has.ltiPlatform` is on.

## Blast radius

Every app: the template code names the new token kinds, and the schema changes need a migration. No lens or
`clientCacheVersion` change. An app that never reads connections, tokens or service accounts itself has only the config
lines and the migration to do.

## Run

No script: manual.

## Manual steps

1. Add `'lti-registration'`, `'lti-tool-registration'` and `'lti-launch'` to `tokenKinds` in
   `shared/config/config.default.ts`.
2. Add `ltiPlatform: false` to `has` in the same file.
3. Copy `backend/src/modules/lti-platform/launch-context.ts` from the template: it is pinned, and the upgrade leaves it
   to the app. Its default sends every channel as an LTI context of type Group, Instructor for a role the hierarchy marks
   as elevated and Learner for any other. Change the two functions where the app's channels or roles mean otherwise.
4. Run `pnpm generate`: it adds the columns, the `lti_installations` and `lti_resource_links` tables, check
   constraints, indexes and grants, and needs no hints or hand-written SQL.
5. Fix what the typecheck reports in app-owned code. `guardNavTabs`, `resolveChannelTabs` and a tabs menu read
   `NavTabOptions`, whose tabs may carry `text` in place of `label`.
6. Optional: a channel layout of the app's own shows resource link tabs once it has a `$tool` child route rendering
   `SlotTabHost`, and its `beforeLoad` passes `linkedTabs` from `loadLtiResourceLinkTabs` to `guardNavTabs`, as the
   organization layout does.

## Verify

```sh
pnpm generate
pnpm check
```
