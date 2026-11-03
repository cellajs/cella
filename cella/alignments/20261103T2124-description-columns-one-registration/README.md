---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: materialized, yjsTokens, setYjsToken, yjsTokenKey, registerYjsOwnedFields, derivedKeys, stopResyncWatch, watchPendingStructs, syncedVector, tabId
---

# Description columns register once; the relay's write is its window's row, and the Yjs token lives in its query

A type registers the columns its server derives from a description once, with `registerDescriptionColumns(type, columns)`, where it called `registerYjsOwnedFields(type, ['description', ...columns])`; `mergeServerResponse` takes them for a description write, so `derivedKeys` keeps only its other entries. A Yjs materializer takes `(ctx, id, input)`: the `materialized` option and `MutationPayload.materialized` go. `userStore.yjsTokens`, `setYjsToken` and `yjsTokenKey` go. The pending-structs watch (`yjs-resync.ts`, `stopResyncWatch`) and the stored `syncedVector` and `tabId` go.

## What & why

The owned-field list and `derivedKeys.description` were one per-type list said twice. The materialize window marks exactly the write the flag marked, so the yjs handler compares each row's id with the window's entity. The token was copied from its query into the user store by three writers. The resync watch repaired a loss no path produces and logged nothing. Nothing read `syncedVector` or `tabId`.

## Blast radius

Apps with collaborative products of their own: their materializer ops and `query.ts` registrations. No wire, schema or `clientCacheVersion` change; old Dexie rows keep their unread fields. During a rolling deploy a new relay ignores an old relay's or an old backend's single-row log notice; the live stamp's check catches it up on its next run, so peers see that edit late while durability is unaffected.

## Run

No script: manual.

## Manual steps

1. Drop `materialized` from each materializer op's `opts` and from its `dispatchMutation` payload: raak `task/operations/update-task.ts:36-39,119`, `label/operations/update-label.ts:31-34,100`; projectcampus `item/operations/update-item.ts:39-42,110`, `material/operations/update-material.ts:27-30,56`. Edit the JSDoc sentences that name it (raak `update-task.ts:28`, `update-label.ts:23`; projectcampus `update-item.ts:32-33`, `update-material.ts:19`).
2. raak `update-task.ts:36`: the op is the task's `yjsMaterializer`, which takes three arguments, so `opts` becomes optional (`opts: { fullResponse?: boolean } = {}`).
3. A second row an op writes inside the materialize window (projectcampus `update-item.ts` unpins siblings and cascades comments) needs no change: its id differs from the window's entity, so its outside write is recorded as before.
4. raak `task/query.ts:117-120`: `registerDescriptionColumns('task', taskDerivedDescriptionFields)`; at `:396` `derivedKeys` keeps `status: ['statusChangedAt']` only.
5. raak `label/query.ts:70`: `registerDescriptionColumns('label', ['keywords'])`; at `:207` drop `derivedKeys`.
6. projectcampus `item/query.ts:80` and `material/query.ts:56`: `registerDescriptionColumns(type, productDocumentDerivedFields)`; drop the `description` entry of `productDerivedKeysByOp` (`common/product-update-ops.ts:22-25`) and its assertion in `common/tests/product-update-ops.test.ts:131-134`. `getYjsOwnedFields` still answers `['description', ...columns]`.
7. Replace `userStore.setState({ ..., yjsTokens: {} })` with the same call without the key wherever the app's own code sets it (raak and projectcampus `utils/teardown-user-state.ts:26`). A test that hands a connection its token writes the token query (`queryClient.setQueryData(yjsTokenKeys.entity(type, id), token)`).

## Verify

The grep must print nothing.

```sh
grep -rnE 'registerYjsOwnedFields|yjsTokens|setYjsToken|stopResyncWatch|materialized( \}|\?: boolean|: true)|derivedKeys: \{ description' backend/src backend/tests frontend/src
pnpm --filter frontend exec vitest run src/modules src/query
pnpm check
```
