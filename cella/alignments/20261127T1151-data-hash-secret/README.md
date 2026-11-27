---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: PII_HASH_SECRET, createHash
---

# Stored token hashes are keyed, and PII_HASH_SECRET is DATA_HASH_SECRET

Rename `PII_HASH_SECRET` to `DATA_HASH_SECRET` in each `.env` and keep its value. At the deploy every session, API key,
link, OAuth code and refresh token ends once: reissue the API keys and resend the pending invitations. App code that
reads `serviceSecret('PII_HASH_SECRET')` or hashes a token with its own SHA-256 moves to the new name or to `hashToken`.

## What & why

`hashToken` in `backend/src/utils/hash-token.ts` is HMAC-SHA-256 under `DATA_HASH_SECRET`; it was plain SHA-256.
Whoever could write the database as `runtime_role` could store the hash of a value they chose in `tokens` or `api_keys`,
then sign in as any user without MFA or act as any service account. The secret now keys pseudonyms and token hashes:
`PII_HASH_SECRET` is renamed for it. The infra store keeps the name `pii-hash-secret`.

## Blast radius

Every app, once, at the deploy: users sign in again, API keys stop working, MCP and OAuth clients authorize again, and
emailed links fail. No schema change, lens or cache bump. Production needs nothing in the secret store.

## Run

No script: manual.

## Manual steps

1. In each developer's `.env`, rename the `PII_HASH_SECRET` line to `DATA_HASH_SECRET` and keep its value.
2. Replace `serviceSecret('PII_HASH_SECRET')` in app code with `serviceSecret('DATA_HASH_SECRET')`: the typecheck names each site.
3. Replace an app's own SHA-256 of a session token, link or API key (`createHash('sha256')`) with `hashToken` from `#/utils/hash-token`.
4. After the deploy, revoke each API key and issue a new one: an old key fails but stays listed as live.
5. After the deploy, resend each pending invitation: its emailed link no longer opens.

## Verify

```sh
pnpm --filter infra test
pnpm check
```
