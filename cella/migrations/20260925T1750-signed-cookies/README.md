# Auth cookies are signed in every mode

## What & why

`setAuthCookie` and `getAuthCookie` (`backend/src/modules/auth/general/helpers/cookie.ts`) seal every cookie as `<content>.<expiresAt>.<mac>`, the MAC covering the versioned cookie name and the expiry, in every mode. Before, only production signed, and only the value, so a hand-written cookie was trusted elsewhere and a value signed for one cookie read as another. `COOKIE_SECRET` may be a comma-separated list: the first signs, any verifies. `cookieVersion` is `v3`.

## Blast radius

Sync-breaking for app tests, scripts and bench processors that build cookies by hand (`${authCookieName(name)}=${value}`): they must sign. Every user is signed out once. No database change.

## Run

No script: manual.

## Manual steps

1. Tests: build cookies with `authCookie(name, content)` from `backend/tests/helpers.ts`; `createTestSession` already signs.
2. Scripts that mint sessions: sign with `sealAuthCookie`, or use `pnpm --filter backend session:mint <email>`.
3. An app with its own `cookieVersion` bumps it.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/cookie-integrity.test.ts
pnpm check
```
