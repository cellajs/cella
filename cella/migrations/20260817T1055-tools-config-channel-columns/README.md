# toolsConfig moves into channelColumns()

## What & why

The per-channel tool arrangement column (`toolsConfig` jsonb, sparse, `NOT NULL DEFAULT '{}'`)
moves from a hand-declared column on `organizations` into the shared `channelColumns()` factory
(`backend/src/db/utils/channel-columns.ts`), and `mockChannelColumns`
(`backend/src/mocks/mock-entity-columns.ts`) mirrors it. The placement/settings/tabs machinery
was already generic over channel types; only the column was org-only, and migration
`20260730T0858` step 5 told apps to hand-copy it per channel table. That step is superseded.

## Blast radius

Sync-breaking, DB-touching, additive. Every fork channel table spreading `channelColumns()`
gains a `tools_config` column on the next `pnpm generate` — including channels that never use
tool arrangement (the column stays dormant at `'{}'`; no backfill, wire field remains optional).
No `clientCacheVersion` bump.

**Collision warning:** an app that already hand-added `toolsConfig` to a channel table (per the
old step 5) MUST delete its local column declaration when it takes this sync. A leftover
explicit key after the `...channelColumns(...)` spread silently wins with no TypeScript error,
and the drift only shows up as a `pnpm generate` no-op where a diff was expected.

## Run

No script — manual.

## Manual steps

1. Delete any hand-declared `toolsConfig` column from channel table files (organizations,
   plus any app channel tables that copied it).
2. `pnpm generate` — review the SQL: one `ADD COLUMN tools_config jsonb NOT NULL DEFAULT '{}'`
   per channel table that lacked it; tables that already had the column produce no diff.
3. `pnpm --filter backend migrate`.
4. Per channel that should persist arrangement, thread the field through response/update
   schemas and merge it in the update query (unchanged guidance from 20260730T0858 step 5;
   `organization-schema.ts` / `organization-queries.ts` remain the reference).
5. If app mocks hand-roll channel rows instead of using `mockChannelColumns`, add
   `toolsConfig: {}` there.

## Verify

`pnpm generate` is a no-op when run a second time; `pnpm check` and `pnpm test` pass.
