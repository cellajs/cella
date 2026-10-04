---
syncBreaking: true
clientCacheBump: false
---

# Outside writes as updates: a description written through the API joins the live document

A description written through the API (REST, MCP, an import) becomes a Yjs update of the live document in the writing
transaction (`recordYjsOutsideWrite`). It no longer ends editing sessions. Only a delete retires a document, and the
relay closes its sockets with 4410. The backend owns the one way into the log (`appendYjsUpdate` in `yjs/operations/`,
`findYjsDocument` in `yjs-queries.ts`), and relays wake on `pg_notify`. Update ops must clear `stx.changedFields` on a
write that changes no field. `useYjsToken` returns `deleted`, and `isYjsTokenRefusal` is now `yjsTokenRefusal`. Deploy
the backend and the relay together.

## What & why

An outside description write appended no update and retired the document, which ended every editing session.
Release 2 diffs it into the live document as a server-origin log row, so editors receive it in place and merge their
own edits. Retirement is for deletions only, and closes with `4410`. One general append serves the relay, outside
writes and, later, client updates over HTTP.

## Blast radius

Sync-breaking for apps with collaborative products (raak, projectcampus): their update ops and any write path without
`<type>.updated`. Each relay holds one more database connection, for LISTEN, and needs a direct Postgres connection,
not a transaction pooler. No `clientCacheVersion` bump and no schema change.

## Run

No script: manual.

## Manual steps

1. Update ops of collaborative products store the resolved stx when a field changed, and `stripChangedFields(table.stx)` when none did, as `updateAttachmentOp` does; that value is `SQL`, so the update query types `values` as `PgUpdateSetSource<typeof table>` from `drizzle-orm/pg-core`. An op that returns before the UPDATE when no field changed meets this too. The yjs handler reads `stx.changedFields` to tell a description write.
2. A write path that dispatches no `<type>.updated` calls `recordYjsOutsideWrite({ var: { db: tx } }, { entityType, rows })` from `#/modules/yjs/operations/record-outside-write` in its transaction, after its UPDATE. `retireYjsDocuments(ctx, { entityType, entityIds })`, now in `#/modules/yjs/operations/retire-yjs-documents` and notifying, is for deletions only.
3. Dispatch `<type>.updated` inside the write transaction (tenant context set): outside one, RLS hides the document and nothing is recorded.
4. Remove app code that expects a reload or a new generation after an API write; editors receive it as an update.
5. Where a collaborative document exists, a description the editor schema cannot hold, or a change over 2 MB, is refused with 400 `invalid_request`. App tests writing such bodies expect that.
6. Frontend: read `deleted` from `useYjsToken` next to `refused`, and rename `isYjsTokenRefusal` to `yjsTokenRefusal`, which returns `'deleted'` (404), `'refused'` (403) or null. A deleted entity shows the `c:deleted` status. Add `c:deleted` and `error:sync_deleted.text` to app locales other than en.
7. Code that wraps or mocks the relay: `authorizeDoc` returns a verdict; `loadBase`/`ensureDoc`/`readLog` become `loadDocument`/`seedDocument`/`readLogOf`; `appendUpdate` returns an `AppendResult`; `compactState` returns a `FoldResult`; `lib/blocknote-seed.ts` is gone (use the backend's `descriptionToSeed` and `stateToBlocksJson`).
8. Size the database for `YJS_DB_POOL_MAX + 1` connections per relay process, two relays during a start-first rollout. `DATABASE_URL` must reach Postgres directly, since a transaction pooler breaks LISTEN.

## Verify

```sh
pnpm test:core
pnpm check
```
