---
syncBreaking: true
clientCacheBump: false
---

# RLS reads: policies read their settings once, attachments page from an index

Run `pnpm generate`: it writes one `ALTER POLICY` for every table built with `tenantSelectPolicy`
(`backend/src/db/rls-helpers.ts`), the `attachments_organization_id_created_at_index`, and a side-effects migration
whose verify step expects the new policy text. Give each app product list that pages a whole organization an index on
its default sort.

## What & why

The tenant policy reads `app.tenant_id` and `app.include_deleted` through scalar subqueries, which Postgres evaluates
once per statement where a bare `current_setting()` ran for every row. The attachments list reads its default order
(`created_at desc, id desc`) from an index, with no sort over the organization's rows. Tenant transactions
(`tenant-context.ts`) set their session variables in the round trip that opens them.

## Blast radius

Sync-breaking for raak and projectcampus: their product tables keep the per-row policy until they generate. Touches
the database: `ALTER POLICY` locks each RLS table briefly, and the index build holds writes to `attachments`. No
client cache or API change.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; commit the schema migration and the regenerated side-effects migration.
2. For an app product list that pages a whole organization, add `index('<table>_organization_id_<sort>_index').on(table.organizationId, table.<sort>, table.id)` in its `*-db.ts` for its `getOrderColumns` fallback, ascending even for a `desc` sort: drizzle's `.desc()` emits NULLS LAST, which `ORDER BY ... DESC` cannot use.
3. Check with `EXPLAIN` that a list narrowed to one channel still uses the channel's index after step 2.
4. Code that opens its own RLS transaction with `set_config` moves to the helpers in `backend/src/db/tenant-context.ts`, which refuse an id outside `a-z0-9-`.

## Verify

```sh
pnpm generate
pnpm --filter backend test
pnpm check
```
