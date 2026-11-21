---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: embedded-session, embedded_session_cross_site, lti_launch_not_framed, embeddedSessionHeader, embeddedSessionParam, sessionCookieOf, SessionCookieName, readBrowserSession, findLiveSessionsHeldByUser, tokenKinds, maxEmbeddedSessionsPerUser, EventSource
generate: true
---

# LTI tool: an embedded session per frame

An embedded page now names its session by a token in its memory, sent as the value of `X-Embedded-Session` (the
stream's `embeddedSession` query), and the partitioned cookie `embedded-browser-key` holds the browser key the session
row records in the new column `sessions.browser_key_hash`. A finished launch hands the frame an `lti-handoff` token,
which `POST /auth/lti:redeem-handoff` spends for the session. Run `pnpm generate`, add `lti-handoff` to the app's
`tokenKinds` and `maxEmbeddedSessionsPerUser` to its config, and follow the renamed session helpers.

## What & why

A second frame of `/embed` that a platform's page adds ran signed in, and every school on one registrable domain
shared one cookie partition. The token now lives in the frame's memory, and a request counts only with token and
browser key together. Embedded pages request through the SDK client or `apiFetch`, which add the token: a raw
`fetch` or an `EventSource` of an app's own carries no session there.

## Blast radius

Every LTI tool app. Adds a nullable column (`pnpm generate`), no backfill. No `clientCacheVersion` bump. An app that
added no code around the embedded session needs the migration and the two config keys alone.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`: it adds `browser_key_hash` to `sessions`, and nothing else is needed. Embedded sessions started before the deploy stop at their next request, and their frames ask to be opened again.
2. Caught by the compiler: add `'lti-handoff'` to `tokenKinds` and `maxEmbeddedSessionsPerUser: 50` beside `maxSessionsPerUser` in the app's `shared/config/config.default.ts`. `sessionCookieOf`, `SessionCookieName` and `readBrowserSession` are gone, `findSession` takes `{ embedded }` where it took a cookie name, and `findLiveSessionsHeldByUser` takes `embedded`: use `resolveSession(ctx, { embedded })`.
3. Where an app test sends `X-Embedded-Session: 1` or reads the `-embedded-session-` cookie, it uses `embeddedSessionOf`, `embeddedHeaders` and `browserKeyCookieOf` from `backend/tests/oauth-helpers.ts`.
4. Where the app's `appError.json` overrides `embedded_session_cross_site` or `lti_launch_not_framed`, drop them: the first error is gone, and the second's text is `backend:lti.not_framed`, which has no override file: edit the app's `backend.json`.

## Verify

```sh
pnpm generate
pnpm check
```
