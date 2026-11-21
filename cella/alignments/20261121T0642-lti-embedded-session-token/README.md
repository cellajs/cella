---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: embedded-session, embeddedSessionHeader, embeddedSessionParam, sessionCookieOf, SessionCookieName, readBrowserSession, findLiveSessionsHeldByUser, storedUserIds, EventSource
generate: true
---

# LTI tool: an embedded session per frame

An embedded page now names its session by a token in its memory, sent as the value of `X-Embedded-Session` (the
stream's `embeddedSession` query), and a partitioned cookie `embedded-browser-key-<id>` holds the browser key the
session row records in the new column `sessions.browser_key_hash`. Run `pnpm generate`. App code that reads the
`embedded-session` cookie, calls `sessionCookieOf`, `readBrowserSession` or `findSession(ctx, 'session')`, or makes a
request from an embedded page outside the SDK client and the stream manager follows.

## What & why

A second frame of `/embed` that a platform's page adds ran signed in, and every school on one registrable domain
shared one cookie partition. The token now lives in the frame's memory, `/auth/lti/finish` hands it over through a
one-use code in the address fragment (`POST /auth/lti:redeem-handoff`), and a request counts only with token and
browser key together. The embedded user stays out of `localStorage`, and an embedded document coordinates with no tab.

## Blast radius

Every LTI tool app. Adds a nullable column (`pnpm generate`), no backfill. No `clientCacheVersion` bump. An app that
added no embedded page of its own and no code around the embedded session needs only the migration.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds `browser_key_hash` to `sessions`, and nothing else is needed. Embedded sessions started before the deploy stop at their next request, and their frames ask to be opened again.
2. Caught by the compiler: `sessionCookieOf`, `SessionCookieName` and `readBrowserSession` are gone, `findSession` takes `{ embedded }` where it took a cookie name, `findLiveSessionsHeldByUser` takes `embedded`, and the `embedded-session` cookie is gone: browser keys live in cookies named `embedded-browser-key-<id>`. Use `presentedSessionToken` or `resolveSession(ctx, { embedded })`.
3. Not caught by the compiler. In the app's own embedded pages, send every request through the SDK client or `apiFetch`, which add the token: a raw `fetch`, an `EventSource` of its own or an image address on the API carries no session there.
4. Not caught by the compiler. Code that reads the stored user (`storedUserIds`, `localStorage`) in an embedded document finds nobody: read `userStore` or `/me`.
5. Caught by tests: an app test that sends `X-Embedded-Session: 1` or reads the `-embedded-session-` cookie uses `embeddedSessionOf`, `embeddedHeaders` and `browserKeyCookieOf` from `backend/tests/oauth-helpers.ts`.

## Verify

```sh
pnpm generate
pnpm check
```

By hand: launch the app from a platform, add a second frame of the same `/embed` address to that page and see it ask to be opened again, then reload the first frame and see the same page.
