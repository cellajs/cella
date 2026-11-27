---
breaking: true
clientCacheBump: false
caughtBy: compiler
generate: true
---

# One tenant policy per RLS table, and writes check the tenant

Replace `tenantSelectPolicy('<table>', table)` and `...writeThroughPolicies('<table>')` with `tenantPolicy('<table>', table)`
in every table that carries them, then run `pnpm generate`. A write to an RLS table outside a tenant transaction is refused.

## What & why

`rls-helpers.ts` exports one `tenantPolicy`: a policy for every command with the tenant match. `tenantSelectPolicy`,
`writeThroughPolicies` and `rlsPolicyContract` are gone. The write policies were `true`, so `runtime_role` could insert a
row for another tenant, and an `UPDATE` or `DELETE` without a `WHERE` reached every tenant. The same migration puts
`activities`, `sync_state` and `sync_incidents` under the admin-only write trigger.

## Blast radius

Every app with a product table or an RLS table of its own: the typecheck names each site. The database changes: four
policies per table become one. A write to an RLS table outside a tenant transaction now fails. No lens or cache bump.

## Run

No script: manual.

## Manual steps

1. In each table file the typecheck names, import `tenantPolicy` from `#/db/rls-helpers` and replace the two policy lines with `tenantPolicy('<table>', table)`.
2. Run `pnpm generate` with the `--hints` array in `hints.json`, extended with one `create` entry per app table, and commit both new folders in `backend/drizzle`.
3. Move a product write that fails with `new row violates row-level security policy` into `tenantContext` or `tenantContextById`; a write that sets `deletedAt` passes `includeDeleted: true`.
4. Flip an app test that expects a write without a tenant to pass: it now expects the refusal.

## Verify

```sh
pnpm generate
pnpm test:core:runtime
pnpm check
```
