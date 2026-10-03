---
syncBreaking: true
clientCacheBump: true
---

# User activity times move to actors, unused columns go

`user_counters` is gone: `lastSeenAt` and `lastSignInAt` live on the user's `actors` row (`actorsTable`), and
`lastStartedAt` is dropped from the table, the `User` schema and `GET /me`. `userSelect` and `memberSelect` select the
`actors` columns, so every query that uses them adds `.innerJoin(actorsTable, userActorJoin)` (both exported from
`user/helpers/select.ts`); `UserWithCounters` is `UserWithActivity`, `upsertLastSignInAt` is `updateLastSignInAt`,
`upsertLastStarted` is removed. Unused columns go: `emails.verified` (every row is a proof, so `verifiedAt` is
NOT NULL), `connections.clientId` / `deploymentId` and the `'lti'` value of `connectionKinds` / `identityKinds`,
`tenants.subscriptionData`, `product_counters.lastViewedAt`. `clientCacheVersion` bumps.

## What & why

`user_counters` held three timestamps, split from `users` to keep them out of CDC. `actors` is outside the
publication too, and the session lookup already joins it. The table was UNLOGGED, so a crash emptied it: every user
then looked new to the welcome redirect and to the new-device notice. The pruned columns had no reader, or held one
value only.

## Blast radius

Sync-breaking for app code that reads `user_counters`, selects `userSelect` / `memberSelect` without the join (Postgres
refuses the query), writes `emails.verified` or omits `verifiedAt`, or reads a pruned column. One schema migration,
with data carried over. The `User` and `Connection` responses lose properties, so `clientCacheVersion` bumps.

## Run

No script: manual.

## Manual steps

1. `backend/drizzle` is app-owned: run `pnpm --filter backend generate`, then reorder the generated `migration.sql` as the template's `20261002221308_actor_activity_and_column_prune` does: add the `actors` columns, copy them over with `UPDATE "actors" ... FROM "user_counters"`, then `DROP TABLE "user_counters"`; before dropping `emails.verified`, `DELETE FROM "emails" WHERE "verified" = false` and stamp `verified_at` where it is null.
2. Add `.innerJoin(actorsTable, userActorJoin)` to every app query that selects `userSelect` or `memberSelect`; a sort on last seen uses `lastSeenOrder`.
3. Replace `userCountersTable` reads and writes with `actorsTable` (`update`, not an upsert: every user has its row); a test that marks a user as returning updates `actors.lastSignInAt`.
4. Drop `verified` from `emails` inserts and filters, and set `verifiedAt` on every insert.
5. Remove `lastStartedAt`, `subscriptionData`, `clientId`, `deploymentId` and `lastViewedAt` wherever app code, mocks or raw SQL name them.

## Verify

```sh
pnpm --filter backend generate   # a second run reports no changes
pnpm sdk
pnpm check
pnpm --filter backend test
```
