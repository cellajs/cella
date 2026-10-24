---
syncBreaking: true
clientCacheBump: true
---

# The auth data names when each sign-in method was added and last used

`MeAuthData` (`GET /me/auth`) replaces `hasTotp` with `totp` (`{ createdAt, lastUsedAt }` or `null`), `enabledOAuth`
with `oauthIdentities` (`{ provider, email, createdAt, lastUsedAt }[]`), and each institution's `connected` with
`identity` (`{ email, createdAt, lastUsedAt }` or `null`). App code reads `totp !== null`, `oauthIdentities` and
`identity !== null`. `ConnectedStatus` is removed. `clientCacheVersion` bumps.

## What & why

The account page shows TOTP, connected providers and institution accounts as tiles with when each was added and last
used. `getAuthInfo` (`me/operations/get-user-info.ts`) selects those dates: `identities.createdAt` and `lastUsedAt`,
and for TOTP its `createdAt` and the start of its `lastUsedStep`. `findSsoIdentityConnectionIds` becomes
`findSsoIdentities`.

## Blast radius

Apps with their own code on `MeAuthData`, `getAuthInfo`, `findSsoIdentityConnectionIds` or `ConnectedStatus`;
TypeScript reports each. A response shape changes, so `clientCacheVersion` bumps. No database change. An app that
never customized the account page or its auth data is unaffected.

## Run

No script: manual.

## Manual steps

1. Replace `authData.hasTotp` with `authData.totp !== null`.
2. Replace `authData.enabledOAuth` with `authData.oauthIdentities`, reading `provider` from each entry.
3. Replace an institution's `connected` with `identity !== null`.
4. Replace `findSsoIdentityConnectionIds` with `findSsoIdentities`, mapping rows to `connectionId` where only the ids are needed.
5. Replace `ConnectedStatus` with an `ExpandableTile` (`modules/common/expandable-tile.tsx`), or an `IdentityTile` for an identity.

## Verify

```sh
pnpm sdk
pnpm check
```
