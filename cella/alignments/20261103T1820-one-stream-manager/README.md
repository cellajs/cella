---
breaking: true
clientCacheBump: false
caughtBy: tests
grep: StreamConfig, useTabCoordination, BaseStreamSubscriber, isAppStream, onGenerationChange, hostProduct, hostColumn
---

# One stream manager, one subscriber type, one hint per embedded product

`StreamManager` takes no `StreamConfig`, is no longer exported, and its one instance `appStreamManager` always coordinates tabs. `tab-coordinator.tsx` has `postToFollowers(message)` and `onLeaderMessage(handler)` over the `LeaderMessage` union where it had `broadcastStreamChange`, `broadcastStreamSignal`, `broadcastCatchup`, `broadcastSyncHealth`, `onStreamChange`, `onStreamSignal`, `onCatchup` and `onSyncHealth`, and `createEmitter` is internal to `sync-events.ts`. On the server `BaseStreamSubscriber` is merged into `AppStreamSubscriber`, `getByTopic` takes no type parameter, and `isAppStream` and `cdcWebSocketServer.onGenerationChange` are gone. A propagation hint has no `hostProduct` or `hostColumn`, a catchup names each embedded product once, and its hint carries `overflow` past 1000 rows.

## What & why

The config and its `useTabCoordination` switch served a test harness only, followers took leader frames through four single-subscriber emitters, and the server's subscriber generics had one subscriber type and one generation listener. No client read a hint's host fields: it patches every host column its own `productEmbeddings` declares, so a product embedded twice got two identical hints. A catchup's hint read had no bound: past one range read's rows, the host lists refetch.

## Blast radius

Breaking for app code or tests that build a `StreamManager`, call the eight relay functions, extend `BaseStreamSubscriber`, pass a type to `getByTopic`, register a stream without a session, or expect `hostProduct` or `hostColumn` on a hint. No database, lens or cache-version change.

## Run

No script: manual.

## Manual steps

1. A test that built a `StreamManager` with an injected config mocks `postAppCatchup` from `sdk`, `~/query/realtime/tab-coordinator` and the handlers, and imports a fresh `appStreamManager` per case after `vi.resetModules()`, as `frontend/src/query/realtime/stream-manager.test.ts` does.
2. A caller of a `broadcastX` function posts `postToFollowers({ type, ... })`; what a follower does with a `LeaderMessage` lives in the one handler `stream-manager.ts` sets with `onLeaderMessage`.
3. Drop the type argument of `getByTopic` calls, and the `AppStreamSubscriber` import that only served it.
4. A listener of `onGenerationChange` moves into `noteGeneration` in `backend/src/lib/cdc-websocket.ts`, which now ends the app streams itself.
5. Every registered stream is an `AppStreamSubscriber` with a session; an app that adds a second stream type adds its subscriber kind to `subscriber-manager.ts` then.
6. A test that expects `hostProduct` or `hostColumn` on a hint drops them, such as raak `backend/src/modules/label/label-stream.test.ts:34`, which embeds labels in tasks: it still compiles, since `toMatchObject` takes any expected object, and fails at run time. One that expects a catchup hint per embedding expects one per embedded product. `productEmbeddings` entries keep both keys.

## Verify

```sh
pnpm check
```
