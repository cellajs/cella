---
syncBreaking: true
clientCacheBump: false
---

# Embedding usage counters are removed

The CDC worker no longer counts how many host rows reference an embedded row (`e:c:<hostProduct>` keyed by the
embedded row's id in `channel_counters`), and the client no longer refetches embedded lists when host references
move (`collectEmbeddingTouches`, `invalidateEmbeddedUsage`, `invalidateEmbeddedForHost`). An app that reads such a
counter, typically a label `usedCount`, derives the number from its synced host lists instead, or counts on demand.

## What & why

Removed: the embedding branch of `getCountDeltas` (`cdc/src/utils/update-counts.ts`), the counter booking of
`cleanupEmbeddingReferences`, the array-ref recount in `computeChannelCounters`, and the usage refetches in
`frontend/src/query/realtime`. The counter was never synced, so clients guessed when to refetch it and missed own
edits and soft-deleted hosts; its counting rule lived in four places.

## Blast radius

Sync-breaking for apps that read `e:c:<hostProduct>` on an embedded row's id or call the removed client functions.
No schema change, no cache bump. Apps without `productEmbeddings`, or that never read the counter, are unaffected.

## Run

No script: manual.

## Manual steps

1. Find readers: `grep -rn "e:c:\${\|usedCount\|invalidateEmbedded\|collectEmbeddingTouches" backend/src frontend/src mcp`.
2. Displayed counts: derive them from the cached host lists the page already syncs (see SYNC_ENGINE.md, Embeddings).
3. Destructive checks (delete without confirm when unused): count at the moment of the action, `host.<column> @> ARRAY[id]` on the GIN index, or always confirm.
4. Drop the counter from the embedded product's API schema and queries, then `pnpm sdk`.
5. Optional cleanup of the rows nobody reads, one statement per embedded product: `DELETE FROM channel_counters c USING <embedded table> e WHERE c.channel_key = e.id::text;`

## Verify

```sh
pnpm sdk
pnpm check
```
