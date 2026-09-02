# toolsConfig moves into channelColumns()

## What & why

The `toolsConfig` jsonb column (sparse, `NOT NULL DEFAULT '{}'`) moves from a hand-declared column
on `organizations` into the shared `channelColumns()` factory
(`backend/src/db/utils/channel-columns.ts`); `mockChannelColumns`
(`backend/src/mocks/mock-entity-columns.ts`) mirrors it. Supersedes the hand-copy instruction in
migration `20260730T0858` step 5.

## Blast radius

Sync-breaking, DB-touching, additive: every fork channel table spreading `channelColumns()` gains
`tools_config` on the next `pnpm generate` (dormant at `'{}'` where unused; no backfill; wire field
stays optional). No `clientCacheVersion` bump. **Collision warning:** an app that hand-added
`toolsConfig` per the old step 5 MUST delete its local declaration (step 1); a leftover explicit
key after the `...channelColumns(...)` spread silently wins with no TypeScript error.

## Run

No script: manual.

## Manual steps

1. Delete any hand-declared `toolsConfig` column from channel table files (organizations plus any
   app channel tables that copied it).
2. `pnpm generate`; expect one `ADD COLUMN tools_config jsonb NOT NULL DEFAULT '{}'` per channel
   table that lacked it, no diff for tables that already had it.
3. `pnpm --filter backend migrate`.
4. Per channel that persists arrangement, thread the field through response/update schemas and
   the update query (`organization-schema.ts` / `organization-queries.ts` are the reference).
5. App mocks that hand-roll channel rows instead of using `mockChannelColumns` add `toolsConfig: {}`.

## Verify

```sh
pnpm generate   # no-op on a second run
pnpm check
pnpm test
```
