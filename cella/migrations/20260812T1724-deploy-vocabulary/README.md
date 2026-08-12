# Deploy vocabulary: start-first/stop-first, pathPrefix, storeOutputs

## What & why

The 2026-08 planned generation roll adopts the standard deploy vocabulary
(Compose `deploy.update_config.order` / Traefik idioms) and retires the
legacy names in one batch: `replacementStrategy` values `'lb-overlap'` →
`'start-first'` and `'exclusive'` → `'stop-first'`; the service field
`lbPathBegin` → `pathPrefix` (the Scaleway `path_begin` term stays inside the
LB resource layer); the pinned genId fingerprint key `runMigrate` →
`runRelease`; and the flat `db*` stack outputs (`dbConnectionStringAdmin`,
`dbCaCertificate`, …) → the generic `storeOutputs.<storeId>.<key>` object
(the db-exposure/seed CLI reads the primary store's entry).

## Blast radius

Infra-only: no app wire shape, no DB, no sync break, no clientCacheVersion
bump. Fork files affected: `infra/config/services.config.ts` (values + field
name) and anything fork-local reading the retired `db*` stack outputs by
name. The fingerprint-key rename deliberately RE-ROLLS EVERY GENERATION on
the first deploy after adoption — expect a full blue/green replacement of all
VMs (normal cutover, no downtime by design).

## Run

No script — manual (three sed-able renames in one fork file):

```sh
sed -i '' "s/'lb-overlap'/'start-first'/g; s/'exclusive'/'stop-first'/g; s/lbPathBegin/pathPrefix/g" infra/config/services.config.ts
```

## Manual steps

1. Grep fork-local scripts for the retired stack outputs
   (`dbConnectionString`, `dbCaCertificate`, `dbInstanceId`, `dbHost`,
   `dbName` as OUTPUTS — `naming.dbName` is unrelated) and switch them to
   `pulumi stack output storeOutputs --json` → `.<primaryStoreId>.<key>`.
2. Regenerate the compose model: `pnpm --filter infra compose:generate`.

## Verify

```sh
pnpm --filter infra exec vitest run
pnpm --filter infra ts
pnpm check
```

First deploy after merge rolls all generations (intended); watch it complete
one full cutover.
