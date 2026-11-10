---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: stepped_up_secret, sessions_secret_idx, tokens_secret_kind_idx
generate: true
---

# A stored token hash is a secretHash

`sessions.secret` and `tokens.secret` are `secretHash`, and `sessions.steppedUpSecret` is `steppedUpSecretHash`.
`pnpm generate` with this folder's `hints.json` renames the three columns and the indexes `sessions_secret_idx` and
`tokens_secret_kind_idx`. `findSessionBySecret` and `updateSessionSteppedUp` take `secretHash` where they took `secret`.

## What & why

These columns hold the hash of a token, never the token, while `totps.secret` holds a real secret and
`oauth_clients.secretHash` already said hash. The name now tells a reader which of the two a column stores.
`secret-columns.ts` lists the new names, so responses, log redaction and the CDC row image still leave them out.

## Blast radius

Every app: `backend/drizzle` is app-owned, and the typecheck names each typed read and write. Raw SQL that names
`secret` on `sessions` or `tokens` escapes it. No wire, cache or client change: these columns never leave the backend.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate --hints "$(cat cella/alignments/20261110T1836-secret-hash-columns/hints.json)"`: it renames three columns and two indexes and nothing else.
2. App code, seeds and tests that read or write `secret` or `steppedUpSecret` of a session or token row use `secretHash` and `steppedUpSecretHash`.
3. An app that lists `sessions` or `tokens` in its own copy of `backend/src/db/secret-columns.ts` takes the new names.

## Verify

```sh
pnpm migrate
pnpm check
```
