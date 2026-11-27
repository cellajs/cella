---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: RUN_MIGRATIONS_ON_BOOT, scripts/migrate.ts, migrateDatabase, runMigrations
---

# The API never migrates: pnpm dev runs the migrate companion first

The API no longer migrates at boot, and `RUN_MIGRATIONS_ON_BOOT` is gone. The backend's `dev` script starts with `pnpm migrate`, which now runs the release companion (`SERVICE=migrate`) that a deploy runs. `backend/scripts/migrate.ts` is deleted. An app that pins `backend/package.json`, boots the API outside `pnpm dev`, or calls `scripts/migrate.ts` runs `pnpm migrate` first.

## What & why

The flag only ever took its default: on in local modes, off when deployed. Locally the same migrations now run once per `pnpm dev` through the deploy's own step, with its lock timeouts, its diagnostics and its admin seed, and not on every watch restart. `pnpm seed` runs the whole sequence, job store included. A new root `pnpm migrate` runs the backend's, and `pnpm offline` starts its three packages through pnpm, which also works on Windows.

## Blast radius

Local development only; deploys already ran the companion. An app that took the template's `package.json` files unchanged needs nothing. `pnpm dev` now requires `ADMIN_EMAIL` in `.env`, which `.env.example` and create-cella set. No database, lens or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. Remove `RUN_MIGRATIONS_ON_BOOT` from `.env` files and any app-owned compose or CI env.
2. An app that pins or changed `backend/package.json`: set `migrate` to `cross-env SERVICE=migrate NODE_OPTIONS=--disable-warning=ExperimentalWarning tsx src/main.ts`, prefix `dev` with `pnpm migrate && `, and add `"offline": "pnpm dev"` (also to `cdc/package.json`).
3. Replace each app-owned call of `tsx scripts/migrate.ts` with `pnpm migrate`, and each import of `runMigrations` with `migrateDatabase`.

## Verify

Start `pnpm dev` on a database one migration behind: the `[migrate]` lines apply it before the API listens. Then `pnpm check`.
