---
syncBreaking: true
clientCacheBump: false
caughtBy: compiler
grep: modules/auth/tokens-db, bindTokenToUser, findConsentsByUser, findConsentOfUser, deleteConsentsOfUsers, findConnectionBindingUser
---

# The token table lives in auth/tokens/

`#/modules/auth/tokens-db` is `#/modules/auth/tokens/tokens-db`, beside the token lifecycle that is its only importer
in source. App-owned tests that read `tokensTable` import it from the new path. A few auth and grant queries were
renamed (`bindTokenToUser` is `updateTokenUser`, the consent reads and deletes are grant reads and deletes).

## What & why

The token table moved into the module that owns the token lifecycle, so the Biome rule that keeps `tokens/` its only
importer names one folder. Queries take the names of what they read and write.

## Blast radius

App-owned files that import the old path or call a renamed query fail typecheck (projectcampus:
`tests/course-publish.test.ts`, `tests/invitations/draft-invites-app.test.ts`). Synced files arrive with the sync. No
database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Import `tokensTable` from `#/modules/auth/tokens/tokens-db` in app-owned code.
2. Rename calls of the renamed queries in app-owned code; typecheck names each one.

## Verify

```sh
pnpm check
```
