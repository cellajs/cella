---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: embedded-session, embedded_session_cross_site, lti_storage_missing, lti.storage_unanswered, embeddedSessionHeader, embeddedSessionParam, sessionCookieOf, SessionCookieName, readBrowserSession, findLiveSessionsHeldByUser, tokenKinds, maxEmbeddedSessionsPerUser, EventSource
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
browser key together. The launch state lives in the frame's own storage first, and a login that names no storage
frame is no longer refused.

## Blast radius

Every LTI tool app. Adds a nullable column (`pnpm generate`), no backfill. No `clientCacheVersion` bump. An app that
added no code or texts around the embedded session needs the migration and the two config keys alone.

## Run

No script: manual.

## Manual steps

1. Not caught by the compiler. Run `pnpm generate`: it adds `browser_key_hash` to `sessions`, and nothing else is needed. Embedded sessions started before the deploy stop at their next request, and their frames ask to be opened again.
2. Caught by the compiler. Add `'lti-handoff'` to `tokenKinds` and `maxEmbeddedSessionsPerUser: 50` beside `maxSessionsPerUser` in the app's `shared/config/config.default.ts`. `sessionCookieOf`, `SessionCookieName` and `readBrowserSession` are gone, `findSession` takes `{ embedded }` where it took a cookie name, and `findLiveSessionsHeldByUser` takes `embedded`: use `resolveSession(ctx, { embedded })`.
3. Caught by the app's own tests, at run time. Where an app test sends `X-Embedded-Session: 1` or reads the `-embedded-session-` cookie, it uses `embeddedSessionOf`, `embeddedHeaders` and `browserKeyCookieOf` from `backend/tests/oauth-helpers.ts`.
4. Not caught by the compiler. Where the app's `appError.json` overrides `embedded_session_cross_site`, `lti_storage_missing` or `lti_storage_missing.text`, drop them: both errors are gone. Where the app's `backend.json` edits `lti.storage_unanswered`, carry its text to `lti.state_not_kept`, the key's new name. The new `lti.not_framed` there has no override file either: edit the app's `backend.json`.
5. Not caught by the compiler or by tests. An embedded page requests through the SDK client or `apiFetch`, which add the token: a raw `fetch` or an `EventSource` of the app's own carries no session there. Search the app's frontend for both.

## Verify

```sh
pnpm generate
pnpm check
```
