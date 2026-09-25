# Every session ends through endSessions

## What & why

`endSessions` (`backend/src/modules/auth/general/helpers/end-sessions.ts`) stamps the revocation, drops the auth cache
and closes the session's event stream; `revokeSessions` is gone. Streams reconnect on `session_replaced` and
`access_changed` and stop on `unauthorized`. A 60 s sweep closes streams of sessions ended elsewhere, and
`auth_invalidate` (`pg_notify`) drops cached entries in every process.

## Blast radius

Sync-breaking for apps that revoke sessions themselves, listen to `session.revoked`, run their own stream client, or
run processes with guard caches. No database change.

## Run

No script: manual.

## Manual steps

1. Replace `revokeSessions` calls with `endSessions`.
2. Listeners of `session.revoked` handle the added `reason` and `'all'`.
3. Extra processes with guard caches call `listenForAuthInvalidation()`; it needs a session-mode connection.
4. Custom stream clients reconnect on `session_replaced` and `access_changed`.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/session-endings.test.ts backend/tests/security/session-sweep.test.ts
pnpm check
```
