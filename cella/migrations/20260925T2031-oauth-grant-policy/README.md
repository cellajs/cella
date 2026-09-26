# One grant policy for the app's authorization server

## What & why

`grantRefusal` (`backend/src/modules/oauth-server/grant-policy.ts`) decides whether a grant still holds, at consent, in
`findAccount` and in the token guard (30 s cache). Codes and refresh tokens are stored hashed and spent once; a replay
revokes the grant. Only a service account's API key mints `client_credentials` tokens. Access tokens carry `gid` or
`key_id`. An unregistered client's consent shows its host, never its own logo.

## Blast radius

Sync-breaking for apps that import `refusalFor`, `tokenUserCache` or `invalidateOauthClientCache` from the adapter.
Existing access tokens get one 401; clients consent again. No database change.

## Run

No script: manual.

## Manual steps

1. Import `invalidateOauthClientCache` from `oauth-server/client-cache`.
2. Replace `refusalFor` with `grantRefusal`, and `tokenUserCache` with the token grant cache.
3. Optional cleanup: `DELETE FROM oidc_payloads WHERE type IN ('AuthorizationCode','RefreshToken') AND payload ? 'jti';`

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/oauth-grants.test.ts backend/tests/oauth-server
pnpm check
```
