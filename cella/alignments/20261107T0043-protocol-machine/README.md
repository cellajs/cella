---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: -32002, 2026-07-28, MCP-Protocol-Version, at+jwt, resourceMetadataUrl, test-p256dh, PushSendDeps, unsubscribe_failed, getSignedUrlFromKey, validateAuthorizationCode, verifyTotp, reserveTiers
---

# The authorization server, MCP, push, unsubscribe, the relay and provider sign-ins follow their protocols

An authorization request without `resource` answers `invalid_target` on the redirect URI, and an access token needs
the JOSE header `typ: at+jwt`. MCP refuses a missing scope with `-31403` where it answered `-32002`, declares
`2025-11-25`, `2025-06-18` and `2025-03-26` and answers `initialize` with the newest for any other revision, answers
400 for an `MCP-Protocol-Version` it does not implement, 405 on GET and DELETE, 403 for a browser `Origin` other than
the app's and lists only read scopes in its `scopes_supported`. Push registration answers 400 `invalid_push_keys` for
keys no browser makes and 403 for another user's endpoint; `PushSendDeps.send` takes a `topic` and the deps gain
`pausedServices`. A foreign unsubscribe or resubscribe token answers 403 where it answered 401. `getSignedUrlFromKey`
requires `filename`. The relay refuses a page from any origin but `appConfig.frontendUrl`'s. Google and Microsoft
profiles come from the grant's `claims`, and GitHub and Microsoft invitees always get the verification mail.

## What & why

Each change follows the standard a conformance review checked: RFC 8707 §2.1 (`invalid_target`), RFC 9068 §4
(`typ`), the MCP transport and JSON-RPC's reserved codes, RFC 8291 key shapes and endpoint ownership, RFC 9110 §15.5.2
(no scheme applies to an unsubscribe token), RFC 6266 file names and RFC 6455 §10.2 origins. The profile comes from
the validated id_token (OIDC Core §5.3.2), and only a provider that hosts the address skips the mail: Google, for
Gmail and Workspace (`hd`).

## Blast radius

Apps with their own MCP tests or clients, push or unsubscribe tests, a jose helper that signs access tokens, OAuth
provider mocks, `getSignedUrlFromKey` calls or `PushSendDeps` fakes, and an app that serves its frontend from a second
origin. No cache bump, no lens, no database change.

## Run

No script: manual.

## Manual steps

1. A test or client that starts an authorization request sends `resource` (`resourceUri` in `backend/src/modules/oauth-server/resources.ts`); one that expected `invalid_grant` from the token endpoint expects `invalid_target` on the redirect URI.
2. A test helper that signs access tokens with jose sets `typ: 'at+jwt'` in the protected header: any other `typ` answers 401 `invalid_token`.
3. MCP tests and clients read `-31403` for a missing scope, send a declared `MCP-Protocol-Version` (an `initialize` that asks for `2026-07-28` hears `2025-11-25`), and expect 405 on GET and DELETE and 403 for a foreign `Origin`.
4. Push fixtures post a 65-byte uncompressed P-256 `p256dh` and a 16-byte `auth`, both base64url: a placeholder such as `test-p256dh` answers 400.
5. A test that registers an endpoint another user holds expects 403, unless it posts that subscription's stored `auth`, which moves the row to the caller.
6. A fake `PushSendDeps` takes the `topic` argument in `send` and sets `pausedServices: new Map()`: typecheck flags it.
7. Unsubscribe and resubscribe tests expect 403 `unsubscribe_failed` for a token of another user or category.
8. Pass the row's `filename`, or null, to `getSignedUrlFromKey`: typecheck flags each call.
9. A Google or Microsoft mock of `validateAuthorizationCode` returns `claims` (`sub`, `email` and the names): a grant without them answers 401 `invalid_credentials`.
10. An app page served from an origin other than `appConfig.frontendUrl`'s cannot open a relay socket or call the MCP endpoint: serve it from that origin.
11. App copy or tests that promise a GitHub or Microsoft invitee an account without a mail expect the verification mail first.
12. `refuseRateLimited`, `reserveTiers`, `takeTotpAttempt` and `verifyTotp` take no request context: typecheck flags each call.

## Verify

```sh
pnpm --filter backend test
pnpm check
```

Connect the app's MCP client and open a collaborative description from the app's own origin: both still work.
