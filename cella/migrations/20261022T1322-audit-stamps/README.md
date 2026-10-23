---
syncBreaking: true
clientCacheBump: true
---

# Row stamps: one audit column set, ActorRef writers, a public flag, ISO timestamps

Every table a user or a service writes spreads `auditColumns()` (channel and product tables get it through the shared
helpers); `publicAt` is a `public` boolean; every timestamp column is `isoTimestamp()` and reads as ISO UTC text;
`updatedAt`/`updatedBy` and the tombstone are set only through `updateStamps()` / `deleteStamps()`; `createdBy`,
`updatedBy` and `deletedBy` cross the wire as `ActorRef` (`{ id, kind, name, slug, thumbnailUrl }`), resolved by
`withActorRefs()`, and the frontend renders them with `ActorCell`. `withAuditUsers`, `auditUserSelect`,
`coalesceAuditUsers`, `mockAuditUsers` and `nullableUserMinimalBaseSchema` in audit positions are gone. The rules:
[Row stamps](../../AGENTS.md#coding-patterns).

## What & why

One vocabulary for who wrote a row and when, after an inventory found `publishedAt` with two meanings, `publicAt` as a
client-stamped timestamp for a reversible state, four hydration paths for `createdBy` (a service account resolved to
null), hand-written `updatedAt` in every update, and naive `timestamp` columns whose text two sites patched with a `Z`.

## Blast radius

Sync-breaking in every app: table helpers, update and delete operations, response schemas, mocks, audit cells and the
`publicAt` reads. Bumps `clientCacheVersion`. Touches the database: a column type change on every timestamp, `public`
replaces `public_at`, writer keys move to `actors`.

## Run

No script: manual.

## Manual steps

1. Tables: `timestamp({ mode: 'string' })` and `timestamp({ withTimezone: true, mode: 'string' })` become `isoTimestamp()` from `#/db/utils/timestamp-columns`; a partition key column becomes `isoTimestampWithoutZone()`; an explicit SQL name equal to the key goes (`varchar('tenant_id', …)` to `varchar(…)`).
2. An app table with a writer outside the channel and product helpers spreads `auditColumns()` (and `tombstoneColumns()` for a synced product) from `#/db/utils/audit-columns`; a `createdBy`/`updatedBy` typed `UserId` with a `users` key stays only on a person's own rows, like memberships.
3. Stamps: `updatedAt: getIsoDate(), updatedBy: …` becomes `...updateStamps(actorId)`; `.set({ deletedAt, deletedBy, updatedAt: deletedAt, updatedBy: deletedBy })` becomes `.set(deleteStamps(actorId))`; `new Date().toISOString()` and `sql\`now()\`` stamps become `getIsoDate()`; a publish that skipped `updatedAt` now spreads `updateStamps` too. `pnpm style` lists what is left.
4. Hydration: replace `withAuditUsers`, `withAuditUser` and `coalesceAuditUsers` with `withActorRefs` / `withActorRef` from `#/modules/actors/actor-refs`; delete the `auditUserSelect` joins and the `const { createdBy: _cb, updatedBy: _mb, …} = getColumns(table)` destructurings; a hydrator that resolved writers from a member list (`hydrateTask`) hands `createdBy`/`updatedBy` to `withActorRefs`, so a creator who left the channel still shows.
5. Schemas: `createdBy: nullableUserMinimalBaseSchema, updatedBy: nullableUserMinimalBaseSchema` becomes `...auditShape` (plus `...tombstoneShape` on a product) from `#/schemas/entity-base`; a lone `createdBy` becomes `nullableActorRefSchema` from `#/schemas/actor-ref`; `mockAuditUsers` becomes `mockActorRefs`.
6. Public read: `publicAt` becomes the `public` boolean everywhere: table columns, update ops (`public: z.boolean()`), copies of a parent's value onto a child row (`public: parent.public`), list filters (`eq(table.public, true)`), frontend forms and `publicAt !== null` reads. A client-stamped reversible timestamp of the app's own (`hiddenAt`) follows the same rule: a boolean op, stamped by the server.
7. Channels keep `publishedAt` live at insert (`channelPublishedColumn`); a draft create passes `publishedAt: null` as before. A publish spreads `updateStamps(actorId)` beside `publishedAt`, on the channel and on every channel it cascades to.
8. Frontend: `<UserCell user={row.createdBy} …>` becomes `<ActorCell actor={row.createdBy} …>` from `~/modules/user/actor-cell`; `useResolveCan` and `requireEntityAction` take `ActorRef | null`, so code that accepted `string | { id }` reads `.id`; the optimistic builder emits an `ActorRef`.
9. Code that appended `Z` to a timestamp (`new Date(\`${value}Z\`)`, `value.replace(' ', 'T')`) drops it: timestamps are ISO UTC text on both sides of the driver.
10. Database: `pnpm generate` with `hints.json` (answer `create` for each new `public` column and each writer key that moved to `actors`, adding the app's own tables), then hand-edit the SQL as `data.sql` shows: the `UPDATE` before each `DROP COLUMN "public_at"`; every product table's select policy dropped before its first retype and recreated after its last; a table with a publication row filter on `published_at` (projectcampus items and comments) dropped from the publication before the retype and added back with its filter after; and `AT TIME ZONE 'UTC'` in every `USING` cast. Postgres refuses to retype a column a policy or a row filter reads.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm test
```
