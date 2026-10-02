---
syncBreaking: true
clientCacheBump: false
---

# Auth sessions move to their own folder, with queries and operations

Session code moves from auth/general into auth/sessions. sessions-db moves to sessions/sessions-db.
general/helpers/session splits: createSession, setUserSession and evictExcessSessions go to
sessions/operations/create-session; resolveSession, readOwnSession, readSession, findSession and
ResolvedSession to sessions/operations/resolve-session; newSessionToken to
sessions/helpers/session-token; collectSignInContext and SignInContext to
sessions/helpers/sign-in-context. revokeSessions moves to sessions/operations/revoke-sessions,
device-info to sessions/helpers/device-info, session-listeners to sessions/session-listeners, and
deleteAccounts from user/helpers to user/operations. The test mock sessionMock splits into
createSessionMock and resolveSessionMock. Apps update imports and vi.mock paths.

## What & why

Sessions get their own folder under the backend layering: reads and writes are queries in `sessions/sessions-queries`, `user-queries` (`findLastSignInAt`, `upsertLastSignInAt`) and `system-queries` (`findSystemRole`). The impersonation and sign-out handler bodies become `startImpersonationOp`, `stopImpersonationOp` and `signOutOp`. Function names and signatures stay the same.

## Blast radius

Apps that import these paths, mock them in tests or use `sessionMock`; TypeScript reports each import. No database change, no `clientCacheVersion` bump. An app that never touched auth internals is unaffected.

## Run

No script: manual.

## Manual steps

1. `#/modules/auth/sessions-db` → `#/modules/auth/sessions/sessions-db`.
2. Split imports from `auth/general/helpers/session` as listed above, by function.
3. `auth/general/helpers/revoke-sessions` → `auth/sessions/operations/revoke-sessions`; `auth/general/helpers/device-info` → `auth/sessions/helpers/device-info`; `user/helpers/delete-accounts` → `user/operations/delete-accounts`.
4. A test that mocked `auth/general/helpers/session` with `sessionMock` mocks `sessions/operations/create-session` with `createSessionMock` (`setUserSession`) and `sessions/operations/resolve-session` with `resolveSessionMock` (`resolveSession`, `findSession`).

## Verify

```sh
pnpm check
```
