# service accounts, API keys and OAuth clients are activity resources; one secret-column registry

## What & why

`resourceTypes` gains `service_account`, `api_key` and `oauth_client`, and `resourceTables` maps them, so minting or
revoking a key, changing an account and registering a client land in `activities`. User-owned rows stay out:
notifications cover those. Secret columns move to one registry, `backend/src/db/secret-columns.ts`
(`secretColumns`, `secretLookingColumns`, `secretColumnPattern`): `createSelectSchema` now omits them itself,
`lib/redact-keys.ts` feeds log redaction (workers included, `createWorkerLog` takes the paths), and
`compactRowData(tableMeta, rowData)` strips them in the CDC worker.

## Blast radius

Database change (publication + REPLICA IDENTITY on three tables), not sync-breaking, no cache bump. Any app table
with a column ending in hash, secret, jwk, token or password fails the new CDC test until it is listed in
`secretColumns` or `secretLookingColumns`. A hand-written `.omit({ secret: true })` on such a column becomes a type
error, since the wrapper already omitted it.

## Run

No script: manual.

```sh
pnpm generate
```

The side-effect migration adds the three tables to `cdc_pub`; no schema prompts.

## Manual steps

1. App code calling `compactRowData(rowData)` passes the `tableMeta` first.
2. App tables with a secret column: add it to `secretColumns` in `backend/src/db/secret-columns.ts`; drop the hand
   `.omit()` for it in response schemas.
3. App code importing `redactedFields` from `#/lib/pino` imports it from `#/lib/redact-keys`; an app worker calling
   `createWorkerLog(suffix, env)` passes `redactedFields` as the third argument.

## Verify

```sh
pnpm --filter cdc-worker test -- secret-columns
pnpm sdk
pnpm check
```
