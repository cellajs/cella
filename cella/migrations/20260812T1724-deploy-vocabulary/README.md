# Deploy vocabulary: start-first/stop-first, pathPrefix, storeOutputs

## What & why

The 2026-08 generation roll adopts Compose/Traefik deploy vocabulary in one batch:
`replacementStrategy` values `'lb-overlap'` to `'start-first'` and `'exclusive'` to `'stop-first'`;
service field `lbPathBegin` to `pathPrefix` (Scaleway `path_begin` stays inside the LB resource
layer); pinned genId fingerprint key `runMigrate` to `runRelease`; flat `db*` stack outputs
(`dbConnectionStringAdmin`, `dbCaCertificate`, ...) to `storeOutputs.<storeId>.<key>` (the
db-exposure/seed CLI reads the primary store's entry).

## Blast radius

Infra-only: no wire shape, no DB, no sync break, no clientCacheVersion bump. Fork files:
`infra/config/services.config.ts` plus anything fork-local reading the retired `db*` outputs by
name. The fingerprint rename RE-ROLLS EVERY GENERATION on the first deploy after adoption (full
blue/green replacement, no downtime by design).

## Run

No script: manual.

```sh
sed -i '' "s/'lb-overlap'/'start-first'/g; s/'exclusive'/'stop-first'/g; s/lbPathBegin/pathPrefix/g" infra/config/services.config.ts
```

## Manual steps

1. Grep fork-local scripts for the retired stack outputs (`dbConnectionString`, `dbCaCertificate`,
   `dbInstanceId`, `dbHost`, `dbName` as OUTPUTS; `naming.dbName` is unrelated) and switch them to
   `pulumi stack output storeOutputs --json` and `.<primaryStoreId>.<key>`.
2. Regenerate the compose model: `pnpm --filter infra compose:generate`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm --filter infra ts
pnpm check
# first deploy after merge rolls all generations (intended): watch one full cutover complete
```
