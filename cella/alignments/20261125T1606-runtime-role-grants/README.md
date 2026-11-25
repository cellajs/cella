---
breaking: false
clientCacheBump: false
generate: true
---

# The runtime role's table grants start from none

Run `pnpm generate` after the upgrade. The app's new side-effects migration revokes every grant `runtime_role` holds in
the `public` schema, then grants its classes again.

## What & why

Since #1860, every infra apply set the Scaleway database privilege `all` for `runtime_role`. On a database with tables,
`all` grants every privilege on each table, `TRUNCATE` included. The next side-effects migration then failed its verify
step with `grant-excess`. `ensureDatabase` now grants a role only when it holds no privilege on the database. The RLS
block in `10-rls.migration.ts` revokes `runtime_role`'s table and sequence grants before it grants the classes.

## Blast radius

Apps on Scaleway that ran an apply with this engine: their next deploy that carries a side-effects migration fails until
this one ships. A grant an app's own block gives `runtime_role` outside its classes ends. No lens or cache bump.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate` and commit the new `backend/drizzle/<timestamp>_side_effects` folder.
2. Move a table that an app-owned side-effect block grants `runtime_role` into `appFullCrudTables` or `appReadOnlyTables` in `backend/src/db/product-tables.ts`.

## Verify

```sh
pnpm generate
pnpm check
```
