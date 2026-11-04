---
breaking: true
clientCacheBump: false
caughtBy: compiler
grep: versionedSignals, verifyViewCounts, entityCounts, selfCounts, answer.counts
---

# A deleted channel reaches its readers as `channel.deleted`

Deleting a channel below the organization sends the versioned `channel.deleted` signal to the channel's readers, with the channel's id as `subjectId`. The client drops the cached rows below the channel and marks the lists for a refetch. `versionedSignals` is `versionedSignalsOf(table, action)`, a catchup view answer has no `counts`, `parseCounterCounts` returns no `entityCounts` or `selfCounts`, and the client's `verifyViewCounts` is gone.

## What & why

The CDC worker sends no change for the rows a channel delete takes by cascade, so another reader kept them until a count comparison between two catchups of one page session noticed. That comparison also refetched after every create and delete. The signal derives from `hierarchy.channelTypes`, and the API sends it when the worker reports the channel's delete, whichever operation deleted it.

## Blast radius

Every app with channels below the organization: their deletes now reach other readers live and at catchup, and an app's own delete operation needs nothing. Breaking only for app code that reads `versionedSignals`, `entityCounts`, `selfCounts` or a view answer's `counts`. No database, cache or lens change.

## Run

No script: manual.

## Manual steps

1. An app that added a type to `versionedSignals` moves it into `tableSignals` in `backend/src/modules/entities/stream/versioned-signals.ts`, as `{ type }`, with `actions` to narrow it to some changes and `namesRow` to name a deleted channel to its readers.
2. An app test that expects `counts` in a catchup view answer drops the expectation.

## Verify

```sh
pnpm check
```
