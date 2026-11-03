---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: serverOrigin, effectiveStx, registerVariablesVersion, addMutationRegistrar, initMutationDefaults, quarantineFailedSync, failedSync, patchEntityStxInCache, createIDBPersister, resetPersisters
---

# Product writes pass their `stx` through; the quarantine, the mutation registrar and `serverOrigin` go

A product mutation function sends the `stx` its variables carry: `stx` is required on `CreateVariables`, `UpdateVariables` and `DeleteVariables`, and the `stx ?? createStxFor*()` fallbacks go. A module sets its query and mutation defaults on the imported `queryClient` when its `query.ts` loads, where it called `addMutationRegistrar`; `~/query/mutation-registry` is gone. A materializer op drops its `serverOrigin` option and resolves with `resolveUpdateOps`. `~/query/offline/failed-sync`, `patchEntityStxInCache`, `mutationIdOf` and `createIDBPersister` go, and `resetPersisters` is `resetPersister`.

## What & why

The `failedSync` quarantine was write-only: a refused replay already rolls back and toasts. Every hook mints its `stx`, so the fallbacks never ran. Every stx without `replayed` takes the server clock, so `serverOrigin` picked a path the stx already picked. The registrar buffered the singleton every `query.ts` imports. The echo's stx patch made the settle keep stale derived columns. The persister had one scope. The variables readers lose the shapes no device holds.

## Blast radius

Every app with product modules of its own. No wire, lens, schema or `clientCacheVersion` change. The per-user database moves to version 3: Dexie drops `failedSync` and the `queries.scope` index in place and keeps every other row. The compiler misses `serverOrigin` branches, fallbacks and registrations: grep finds them.

## Run

No script: manual. Each step is a small edit in an app-owned file, and the deadline exemption changes behaviour.

## Manual steps

1. Drop the `stx ?? createStxFor*()` fallbacks and send `stx`: raak `task/query.ts:131,145,151`, `label/query.ts:122,129,135`; projectcampus `{comment,item,label,material}/query-mutations.ts`, three each.
2. Pass an stx where a test calls a mutation function without one: raak `task/tests/update-replay.test.ts:20`; projectcampus `comment/tests/comment-replay.test.ts:71,102`, `item/tests/item-replay.test.ts:46,67,87`, `label/tests/label-replay.test.ts:62,93`, `material/tests/material-replay.test.ts:61,85`.
3. Delete the cases that pin the fallback's own stamping, since no mutation function stamps an stx: projectcampus `item/tests/item-replay.test.ts:24-45` (the label-rows case at line 46 stays, with an stx passed) and the first half of `material/tests/material-replay.test.ts:83-89`.
4. Drop `serverOrigin` and its `resolveServerUpdateOps` branch from each materializer op (its `materialized` option goes by 20261103T2124-description-columns-one-registration): raak `task/operations/update-task.ts:36-51`, `label/operations/update-label.ts:31-60`; projectcampus `material/operations/update-material.ts:30-38`.
5. projectcampus `item/operations/update-item.ts:60-66`: resolve with `itemContract.resolveUpdateOps(entity, rawOps, stx)`, and key the deadline exemption on the relay's window: `const relayWrite = yjsMaterializeWindow.getStore()?.entityId === id;` (from `#/modules/yjs/helpers/materialize-window`), then `if (!relayWrite && entity.type === 'submission' && ...)`. Left on `!serverOrigin`, a late collaborative edit of a submission is refused at every materialize.
6. Replace `addMutationRegistrar((queryClient) => { … })` with its body at the top level of the file, on `queryClient` from `~/query/query-client`: raak `task/query.ts:504`, `label/query.ts:308`; projectcampus `comment/query.ts:378`, `item/query.ts:479`, `label/query.ts:237`, `material/query.ts:262`.
7. Remove `initMutationDefaults(queryClient)` from tests, since importing the module's `query.ts` sets its defaults: raak `task/tests/create-list-read.test.ts:114`; projectcampus `item/tests/item-mutations.test.ts:383,411`.
8. A test that mocks `~/query/query-client` with a partial object and loads a module's `query.ts` fails at load: import `~/query/tests/query-client-env` and the real client, as `canonical-home-keys.test.ts` does (projectcampus `query/basic/tests/canonical-home-keys-app.test.ts`).
9. Drop the variables-version registrations, whose old shapes no device holds: raak `task/query.ts:519-530`, `label/query.ts:323-333`; projectcampus `comment/query.ts:393-397`, `item/query.ts:496-500`, `label/query.ts:252-256`, `material/query.ts:277-281`. Delete raak `task/tests/queued-variables.test.ts`.
10. A queued create holds its rows as an array under `data`, and the variables of an stx mutation are one object: a module that queues a top-level row, one record under `data` or an array moves to `CreateVariables`.

## Verify

The grep must print nothing outside `frontend/src/query/offline/mutation-variables.ts` (the ladder stays) and the relay's materialize path.

```sh
grep -rnE 'serverOrigin|effectiveStx|registerVariablesVersion|addMutationRegistrar|initMutationDefaults' backend/src backend/tests frontend/src
pnpm --filter frontend exec vitest run src/modules
pnpm check
```
