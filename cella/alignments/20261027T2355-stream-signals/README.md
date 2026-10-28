---
syncBreaking: true
clientCacheBump: true
caughtBy: compiler
grep: clientCacheVersion, StreamNotification, AppStreamNotification, kind: 'membership', signals.membership, changes[, handleMembershipNotification, handleAppStreamNotification, handleProductNotification, registerNotificationSyncListener, sync-listener, dispatchToAppStream, onNotification, broadcastNotification, stream-notification, build-message, sse.notifications
---

# The app stream sends changes and signals

The `change` event carries product rows only: `StreamNotification` is `StreamChange` without `kind`, `resourceType`
and `channelType`. Everything else arrives as a `signal` event (`StreamSignal`: a type and ids) that a module declares
with `defineBackendModule({ signals })`, sends with `sendSignal(type, toUser(id), ...)` and handles with
`defineFrontendModule({ signals })`. The catchup block `changes` is `organizations`, with `signals` keyed by type.

## What & why

Membership changes rode the product frame behind a `kind` switch hard-coded in five files, and the inbox refetched
after every product change. `membership.changed`, `notification.created` and `notification.read` are now signals;
`sync-listener.ts`, `dispatchToAppStream` (now `dispatchChange`), `build-message.ts` (now `build-change.ts`) and the
client's `*Notification` names (now `*Change`) are gone.

## Blast radius

App code that reads `kind`, `resourceType` or `channelType` off a stream frame, streams its own resource through the
`kind` switch, reads `changes[orgId].signals.membership`, or follows the inbox from `onChangeEvent`. Synced files
arrive with the sync. No database or lens change. The catchup rename breaks the spec, so upstream bumped
`appConfig.clientCacheVersion` to `v23-stream-signals`: every client clears its cached query data on the next load and
keeps its queued mutations.

## Run

No script: manual.

## Manual steps

1. Rename `StreamNotification` to `StreamChange`, `AppStreamNotification` to `AppStreamChange`, `handleAppStreamNotification` to `handleStreamChange`, `onNotification` to `onStreamChange`, `broadcastNotification` to `broadcastStreamChange`.
2. Read the catchup's `organizations[orgId].signals['membership.changed']` where app code read `changes[orgId].signals.membership`.
3. An app-owned resource that reached clients through the `kind` switch: declare a signal type in its backend module, send it with `sendSignal`, add the type to `StreamSignalTypes` (`frontend/src/query/realtime/signal-types.ts`) and handle it in its frontend module.
4. An app that refetched its own state from `onChangeEvent` to follow a non-product row: send a signal for that row and handle it.
5. Bench results compared across the change: the counters `sse.notifications` and `yjs.sse_notifications` are `sse.changes` and `yjs.sse_changes`.
6. If `shared/config` sets its own `clientCacheVersion`, change its value.

## Verify

```sh
pnpm check
```
