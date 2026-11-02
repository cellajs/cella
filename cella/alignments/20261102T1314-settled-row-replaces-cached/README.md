---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: mergeServerResponse, skipKeys, writeEntityToCache
---

# A settled mutation takes the row the server stored

`mergeServerResponse` now takes `queryClient` and writes every field of the response over the cached row once no other mutation of the row is queued. In each product module, pass the client, list in `skipKeys` every key a lite update response stubs, ask for the full row when the update is a replay, and take the response through `mergeServerResponse` where an update `onSuccess` merges it by hand.

## What & why

A remote change of a row with a pending mutation is kept from the cache, and the settle took only the mutated keys and their `derivedKeys`, so that change was lost until the next full read. The server arbitrates a write by its `stx` and returns the stored row, so the client now takes it whole. Yjs-owned fields stay as cached unless the server wrote them. While another mutation of the row is queued, the partial merge still applies.

## Blast radius

Breaking for an app whose update response is not the stored row, or whose update `onSuccess` merges by hand. The compiler names each `mergeServerResponse` call that lacks `queryClient`. An app that answers updates with the stored row gets the fix as is. No database, cache version or lens change.

## Run

No script: manual.

## Manual steps

1. Pass `queryClient` to each `mergeServerResponse` call.
2. Read what each update handler returns. A key it fills with a stub (`labels: []`, `primaryLabel: null`, `createdBy: null`) goes in `skipKeys`, else the stub replaces the cached value after every edit. `skipKeys` keeps the cached value, so a remote change of a skipped key arrives with the next read of the list, not with the settle.
3. An update route that answers the full row on `?fullResponse=true` gets that query from its `mutationFn` when the variables' `stx.replayed` is set, so a queued edit takes the full stored row, its relations included.
4. A product module whose update `onSuccess` writes the response through `writeEntityToCache` without `mergeServerResponse` takes it through `mergeServerResponse` first, or a remote change kept out while the update was pending stays lost.

## Verify

Edit a row offline, change another field of it from a second session, then go online: once the replay settles the row shows both edits, and every relation it showed before. Then run `pnpm check`.
