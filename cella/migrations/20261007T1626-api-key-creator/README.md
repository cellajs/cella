---
syncBreaking: true
clientCacheBump: true
---

# An API key names the user who created it

`ApiKey.createdBy` in every service account response is the minimal user (`UserMinimalBase`) or `null`, where it
was the actor id: app code that reads it as an id reads `createdBy?.id`. `ServiceAccount` responses carry
`lastSeenAt`, so an app query that feeds `serviceAccountSchema` selects it from the account's `actors` row.
`slugQuerySchema` is removed: use `slugIncludeQuerySchema`. `clientCacheVersion` bumps.

## What & why

The API keys card shows who created a key and when its account was last used. `withApiKeyCreators`
(`service-accounts/operations/with-api-key-creators.ts`) resolves `createdBy` on the four key responses, and the
service guard calls `updateLastSeenAt` for a service account, which writes `actors.lastSeenAt`.
`findServiceAccountInTenant` and `listServiceAccounts` join `actors` for it.

## Blast radius

Apps with their own code on `ApiKey.createdBy`, `serviceAccountSchema` or `slugQuerySchema`; TypeScript reports
each. A response property changes type, so `clientCacheVersion` bumps. No database change. An app that never
customized service accounts is unaffected.

## Run

No script: manual.

## Manual steps

1. Where app code reads `apiKey.createdBy` as an id, read `apiKey.createdBy?.id`; a response of your own that returns API keys passes them through `withApiKeyCreators`.
2. Where an app query returns rows for `serviceAccountSchema`, select `lastSeenAt` from `actorsTable` joined on the account id, or return `lastSeenAt: null`.
3. Replace `slugQuerySchema` with `slugIncludeQuerySchema`.

## Verify

```sh
pnpm sdk
pnpm check
```
