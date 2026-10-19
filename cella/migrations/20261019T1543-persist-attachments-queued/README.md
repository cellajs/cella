---
syncBreaking: true
clientCacheBump: false
---

# `persistAttachments` queues the create and returns nothing

`persistAttachments` (`frontend/src/modules/attachment/helpers/persist-attachments.ts`) now runs the queued attachment
create and returns `void`; a failed create toasts through the mutation's own `onError`. Drop the `.catch(...)` an app
module chains on a call to it, with the toast it showed.

## What & why

Editor uploads created their rows with a direct request, outside the offline mutation queue: an upload made offline
never got a row, so its block pointed at nothing. `persistAttachments` now builds the same queued create the upload
table runs (`attachmentCreateOptions`), giving optimistic rows, a paused create persisted offline and a replay on
reconnect or reload.

## Blast radius

Sync-breaking only for app modules that call `persistAttachments` and chain on its promise. The rest of the change
needs no app action: the `linkAttachmentKeys` route, retried `local-only` uploads, the pending-upload placeholders.
No schema change, no cache bump.

## Run

No script: manual.

## Manual steps

1. Find the calls in app-owned modules (`grep -rn "persistAttachments(" frontend/src`) and remove the `.catch(...)` on each, toast included.

## Verify

```sh
pnpm check
```
