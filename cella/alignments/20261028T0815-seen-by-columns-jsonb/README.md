---
syncBreaking: true
clientCacheBump: false
caughtBy: tests
grep: seen_by, channel_id, insertSeenBy, findSeenCandidates
generate: true
---

# seen_by drops three columns; three config columns become jsonb

`seen_by` loses `channel_id`, `organization_id`, `tenant_id` and the indexes `seen_by_user_channel_type_index`,
`seen_by_product_id_index`, `seen_by_tenant_id_index`. `tenants.restrictions`, `tenants.auth_strategies` and
`organizations.languages` are `jsonb`. Run `pnpm generate` to get the migration; `insertSeenBy` takes `productIds`.

## What & why

Nothing read the three `seen_by` columns or their indexes: mark-seen and the unseen counts read `user_id` and
`product_id`, and the view-count recount `product_type`. Every mark-seen paid for three index writes. The three config
columns were the last `json` columns beside seventeen `jsonb` ones.

## Blast radius

Every app: `backend/drizzle` is app-owned, so the migration has to be generated. Until it runs, a mark-seen insert fails
on the old `NOT NULL` columns, which the inherited mark-seen tests catch. No wire, lens or `clientCacheVersion` change.
Neither raak nor projectcampus reads the dropped columns.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`. It produces three `DROP INDEX`, three `DROP COLUMN` on `seen_by` and three `ALTER COLUMN ... SET DATA TYPE jsonb USING ...::jsonb`; no hand-written SQL and no rename hints.
2. App code that calls `insertSeenBy` passes `productIds: string[]` in place of `rows`, `organizationId` and `tenantId`; `findSeenCandidates` returns ids.

## Verify

```sh
pnpm generate   # a second run reports no changes
pnpm check
```
