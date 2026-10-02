---
syncBreaking: true
clientCacheBump: false
---

# Offline documents and Yjs over HTTP

A collaborative document the user opened for editing is stored per user (`LocalUserDatabase` `version(2)`: `yDocs`,
`yDocStates`, `yDocUpdates`, `unsaveableYDocs`), opens from storage, and stays editable offline. When the relay is
out of reach but the API answers, the editor syncs over HTTP (`POST …/yjs/pull`, `POST …/yjs/push`). Edits that can no
longer be saved get a "Copy text" notice, and sign-out asks while edits are unsaved. `useYjsConnection`,
`CollaborationBundle` and `stopConnection` change shape, the seed moves into the backend (`seedYjsDocument`), and the
relay sweeps every five minutes. Deploy the backend and the relay together.

## What & why

Release 3 of the description sync redesign. Documents opened for editing are kept in the per-user database and sync
when a server is reachable again: through the relay, or through the API when the relay is not. Edits no server has
confirmed survive reloads and are never discarded without asking.

## Blast radius

Sync-breaking for apps that wrap the Yjs connection, build a `CollaborationBundle`, customize `local-user-db.ts`, the
sign-out page, `app-layout.tsx` or the Vite chunks, or mock relay storage in tests. No database migration, no
`clientCacheVersion` bump.

## Run

No script: manual.

## Manual steps

1. `useYjsConnection` returns `{ awareness, fragment, ready, transport, synced, stopped, stopReason, rebuilds, unsynced, deleted, storageFailed, markStored }`; render the live editor on `ready`, not `synced`. A `CollaborationBundle` is `{ provider: { awareness }, fragment, user }`.
2. `stopConnection(id, conn, reason, toast?)` takes a `YjsStopReason` (`'denied' | 'refused' | 'expired'`) where it took a message key. `endDeleted` is replaced by `endUnsaveable`.
3. An app with its own Dexie version ladder in `local-user-db.ts` merges `version(2)` and its four tables; an app with its own Vite `manualChunks` keeps `yjs-store`, `yjs-tab-channel`, `storage-warning` and `parked-notices-on-boot` off the editor chunk, as `frontend/vite.config.ts` does.
4. An app with its own `app-layout.tsx` mounts `<ParkedNoticesOnBoot />` next to `<TabCoordinator />`; one with its own sign-out page keeps the `UnsavedEditsGate` (loaded lazily) and `flushYjsStore()` before reading the list.
5. Locales: add `c:deleted`, `c:sync_limited.text`, `c:storage_low`, `c:storage_unavailable.text`, the notice and sign-out dialog keys and the `copy_*` keys to app locales other than en; `error:sync_deleted` is removed and `c:collaboration_stopped.text` and `error:sync_document_replaced.text` are reworded.
6. Relay tests that mocked `lockEntityDescription` mock `findEntityDescriptionForShare` in `#/modules/yjs/yjs-queries`; `runStartupSweep` is renamed `runSweep`. `authorizeYjsEditor` is the one permission check for the token, pull and push routes.
7. Regenerate the SDK (`pnpm sdk`) for the pull and push routes. A per-user HTTP limiter (7,200 requests an hour) guards both and charges no API points.
8. Tests in jsdom that write to Dexie need one realm for `Uint8Array` (see `tests/yjs-connections-store.test.ts`).

## Verify

```sh
pnpm sdk
pnpm test:core
pnpm check
```
