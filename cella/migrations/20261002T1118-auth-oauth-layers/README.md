---
syncBreaking: true
clientCacheBump: false
---

# OAuth sign-in moves to queries and operations

identities-db moves from auth to auth/oauth, with its reads and writes in
auth/oauth/identities-queries. callback, handle-oauth-verification, send-oauth-verification-email
and initiation move from auth/oauth/helpers to auth/oauth/operations; parseOAuthCookie and
readOAuthCookie move from initiation to auth/oauth/helpers/oauth-cookie. me/helpers/get-user-info
moves to me/operations/get-user-info. Apps update imports and vi.mock paths.

## What & why

Reads and writes of `identities` are queries in `identities-queries` (`findIdentityBySubject`, `findIdentityById`, `findVerifiedOAuthIdentities`, `insertIdentity`, `updateIdentity`); the OAuth flows are operations. `getAuthInfo` and `getUserSessions` read through the passkey, TOTP, identity, session and device queries. `providers` and `transform-user-data` stay helpers.

## Blast radius

Apps that import these paths or mock them in tests; TypeScript reports each import. No database change, no `clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `#/modules/auth/identities-db` → `#/modules/auth/oauth/identities-db`.
2. `auth/oauth/helpers/{callback,handle-oauth-verification,send-oauth-verification-email,initiation}` → `auth/oauth/operations/` under the same file names; `parseOAuthCookie` and `readOAuthCookie` from `auth/oauth/helpers/oauth-cookie`.
3. `me/helpers/get-user-info` → `me/operations/get-user-info`.
4. Update `vi.mock` paths in your tests the same way.

## Verify

```sh
pnpm check
```
