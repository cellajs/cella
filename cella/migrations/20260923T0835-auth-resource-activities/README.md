# service accounts, API keys and OAuth clients are activity resources; CDC redacts secret columns

## What & why

`resourceTypes` gains `service_account`, `api_key` and `oauth_client`, and `resourceTables` maps them, so minting or
revoking a key, changing an account and registering a client land in `activities`. User-owned rows (sessions,
identities, passkeys, emails) stay out: notifications cover those. `backend/src/tables.ts` adds `redactedColumns`
(`api_key.hash`, `oauth_client.secretHash`), which `compactRowData(tableMeta, rowData)` strips in the CDC worker,
and `sensitiveColumnPattern`, which a test compares against every tracked column.

## Blast radius

Database change (publication + REPLICA IDENTITY on three tables), not sync-breaking, no cache bump. An app that
tracks its own resource table with a column ending in hash, secret, jwk, token or password fails the new CDC test
until it lists that column in `redactedColumns`.

## Run

No script: manual.

```sh
pnpm generate
```

The side-effect migration adds the three tables to `cdc_pub`; no schema prompts.

## Manual steps

1. App code calling `compactRowData(rowData)` passes the `tableMeta` first.
2. App resource tables with a secret-like column: add it to `redactedColumns` in `backend/src/tables.ts`.

## Verify

```sh
pnpm --filter cdc-worker test -- compact-row-data
pnpm sdk
pnpm check
```
