---
breaking: true
clientCacheBump: false
caughtBy: nothing
grep: cascadeSettleMs, handleChannelDeleted, refetchBelowDeletedChannels, isAtOrInside
---

# A channel cascade sends one channel.deleted, for its root

A channel deleted together with an ancestor no longer moves or sends `channel.deleted`: the CDC worker's
`flushSignals` leaves it to the root's signal, and `handleChannelDeleted` drops the channels and product rows cached at
and inside the root in one pass, with no settle timer. An app with nested channels reviews its own handlers of the
signal and any copy of the old `isAtOrInside`, now `hierarchy.isAtOrInside`.

## What & why

Every channel of a cascade sent its own signal, so the client waited a second (`cascadeSettleMs`) and grouped the
refetches per organization. One signal per cascade lets the handler drop the subtree at once. A recorded change now
names the versions it moved: a covered channel delete carries an empty `signalVersions`, and the entities listeners
send no live signal for it.

## Blast radius

Apps with channels nested below other channels. A reader of only an inner channel gets no live signal for its delete
and recovers at its next catchup, as with an archive. No database, wire-shape or `clientCacheVersion` change.

## Run

No script: manual.

## Manual steps

1. An app that handles `channel.deleted` itself, or wraps `handleChannelDeleted`, drops the channels inside the named one too, using `hierarchy.isAtOrInside(type, row, channelId)`, since their own signals no longer come.
2. Replace an app-local copy of `isAtOrInside` with `hierarchy.isAtOrInside`.

## Verify

```sh
pnpm check
pnpm --filter frontend exec vitest run src/query/realtime/channel-deleted.test.ts
```

Then delete a channel with a channel inside it in one tab and check a second tab drops both and their rows at once.
