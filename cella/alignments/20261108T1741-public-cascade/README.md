---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: publicCascadeHandlers, cascadeChannelPublic, home.entity.public, home?.entity.public, publicOnly
---

# A product's public flag follows its home channel

A product with a public read grant now takes its `public` from its home channel everywhere: at create and on a move
through `resolvePlacement(...).columns.public`, and when the channel's flag changes through the cascade the entities
module registers from `publicReadGrants`. An app deletes its own cascade and its hand-copied `home.entity.public`,
dispatches each channel's `.updated` inside `tenantContextIncludingDeleted`, drops `public` from product update
bodies, and backfills the rows that drifted while the flag was copied once.

## What & why

A row's flag was copied at create and never touched again, so a channel made public showed none of its older rows
and a channel made private left the rows created meanwhile readable. `publicCascadeHandlers()` in
`backend/src/permissions/public-cascade.ts` rewrites the rows homed at a changed channel, soft-deleted ones included,
in the channel write's transaction, refusing more than its row cap with 409 `channel_too_large`. `resolvePlacement`
returns the home's flag in `columns` and holds the home row (`forShare`), while a channel `forUpdate` is now `FOR
UPDATE`, so a create and a toggle serialize. A `public` that goes false reaches readers as a `moveOut`, and
`POST /public/tenants/{tenantId}/organizations/{organizationId}/attachments/~presign-urls` signs files for a visitor.

## Blast radius

Every app with `publicRead()` on a product. The cascade runs only for those entity types, so an app without the grant
gets the placement and lock changes and nothing else happens. No wire-shape change for a client, no lens, no
template migration: the backfill is the app's own data move.

## Run

No script: manual. The grep list finds an app's own cascade and its copied flags.

## Manual steps

1. Delete an app-local cascade (raak: `backend/src/permissions/public-cascade.ts` arrives as the template's; drop `onMutation: publicCascadeHandlers(...)` from the product modules and `20-publicat-cascade.migration.ts` once the backfill below ran).
2. In each channel update and publish operation, run the update and `dispatchMutation('<channel>.updated', { before, after })` inside `tenantContextIncludingDeleted`, as `update-organization.ts` does; the cascade throws when dispatched outside a transaction.
3. In each product create and move, call `resolvePlacement` inside the write's `tenantContext` and spread its `columns`, which carry `public`; delete a hand-copied `home.entity.public` or `organization.public`.
4. Remove `public` from every product update body and its contract: the channel decides it.
5. Backfill after the code is live, one statement per product table with the grant, soft-deleted rows included: `UPDATE <products> p SET public = c.public, stx = p.stx || jsonb_build_object('mutationId', gen_random_uuid()::text, 'sourceId', 'server') FROM <channels> c WHERE p.<channel>_id = c.id AND p.public IS DISTINCT FROM c.public;`, as an app-owned side-effect block.
6. A public list route that filters `publicOnly` keeps that filter; a public page's files now sign through `getCloudUrl` while signed out, so an app-owned signer for visitors goes.

## Verify

```sh
pnpm sdk
pnpm check
cd backend && pnpm exec cross-env TEST_MODE=core vitest run tests/public-cascade.test.ts
```

Then, in the running app: make a channel with rows public and open its public page as a visitor, with a file; make it
private and check that a signed-in reader outside the channel loses the rows without a reload.
