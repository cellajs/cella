---
breaking: false
clientCacheBump: false
generate: true
---

# Signing keys are current and next

`signing_keys` loses `retired_at` and the `retired` status, and its plain `signing_keys_status_idx` goes, since the unique
index on `status` now covers every row. `pnpm generate` drops the column and the index and rebuilds
`signing_keys_one_per_status_idx` without its `where`; port this folder's `data.sql` into the migration first.

## What & why

Nothing ever retired a key: rotation is not built, so the `retired` status, `retiredAt` and the grace period in
`keystore.ts` were a lifecycle no code ran. The JWKS and the in-process verifier publish the `current` and `next` keys,
and taking a key out of the keystore is what revokes the tokens it signed.

## Blast radius

Every app's database: `backend/drizzle` is app-owned. No app code reads signing keys, so nothing else moves. No wire,
cache or client change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` (with the hints of any other schema alignment you apply in the same run).
2. Put `data.sql` at the top of the generated migration, before the column drop.

## Verify

```sh
pnpm migrate
pnpm check
```
