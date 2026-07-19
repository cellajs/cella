# Attachment module

Attachments are file uploads (images, video, audio, PDFs, anything else) scoped to an organization. An attachment is two things that this module constantly has to keep distinct:

- the **entity row** — metadata in Postgres (`Attachment` in the sdk), replicated to the client through the normal entity-sync machinery (canonical org query + SSE + delta fetch), and
- the **file bytes** — stored in S3 via Transloadit processing, optionally mirrored into a local per-user IndexedDB blob store for offline viewing.

Everything in this module is a layer on one of those two, or glue between them.

## File variants

Transloadit processing produces up to three cloud objects per file, referenced by key fields on the row: `originalKey` (processed original), `convertedKey` (e.g. HEIC→JPEG, with `convertedContentType`), `thumbnailKey`. The local blob store adds a fourth, local-only variant: `raw` — the untouched user file, stored before upload so nothing is lost offline. Variant vocabulary lives in `dexie/attachments-db.ts` (`BlobVariant`).

## Layers

**Query layer** (`query.ts`, `query-mutations.ts`). One canonical flat query per org (`['attachment','list',orgId]`) that sync keeps fresh; the table serves its default view from it via `select`, and any deviating filter/sort switches to a server-filtered infinite query. Mutation hooks are optimistic with rollback; mutation _functions_ are separated into `query-mutations.ts` so persisted offline mutations can replay identically after a reload (`tests/attachment-replay.test.ts` locks this in). `useGroupAttachments` derives multi-file upload groups (`groupId`) from the canonical query.

**The offline pipeline** (`offline/`) — one subsystem, one folder. `attachments-db.ts` defines the schema and resolves tables from the per-user appdb (throws while signed out — guard with `getAppDb()`). `storage-service.ts` (`attachmentStorage`) is the blob CRUD API: store upload/download blobs, variant fallback chains (`converted → original → raw` for display, `thumbnail → original → raw` for thumbs), raw-blob eviction once a durable variant exists, per-org storage accounting. `download-queue.ts` is the state machine for background caching (`pending → downloading → downloaded/failed`, plus `skipped` with a reason; skip filters and priority come from `appConfig.localBlobStorage`).

The queue table doubles as the **dedupe registry**: a `downloaded` or `skipped` row is what stops an attachment being re-fetched on every list refresh, so rows are left alone rather than collected. `enqueue` is the one place that revives them — a `skipped`-for-no-key row once its key arrives, a `failed` row while `attempts < downloadRetryAttempts`. Rows are dropped only when their attachment is deleted (`downloadQueue.remove`).

`download-service.ts` and `upload-service.ts` are started together in `~/query/provider.tsx`. The download service watches the query cache: any attachment appearing in a list query gets enqueued, then variants are fetched (thumbnail first) and stored locally — automatic, capped at `maxTotalSize` per org (default 100MB), `video/*` excluded by default. It also watches the mutation cache to drop local blobs and queue rows when attachments are deleted. The upload service pushes locally-stored `pending` blobs to Transloadit (headless Uppy, fresh token per upload) every 60s and on reconnect; without cloud config, blobs are downgraded to `local-only`.

**URL resolution.** `file-url.ts` builds cloud URLs and owns the public-vs-private branch: public files → CDN URL from the key; private files → presigned URL requested _by attachment id + variant_ so the server resolves and signs it (the client never submits a storage key). Use `getCloudUrl` rather than re-deriving that branch. `helpers/resolve-url.ts` is the engine on top: `resolveAttachmentUrl` tries the local blob first, falls back to cloud, and opportunistically enqueues a background download; `resolveBlockNoteFileRef` is the same idea for editor block references. `hooks/use-attachment-url.ts` (single) and `hooks/use-resolved-attachments.ts` (batch, with retry-before-"not found" and blob-URL lifecycle management) are the React bindings.

**UI.** `table/` is the org attachments grid (route `/$tenantId/$orgSlug/organization/attachments`): thumbnail with upload-status badge, inline rename (the only editable field), per-row cloud download, bulk delete with confirmation, seen-marking via row visibility. `dialog/` + `attachments-carousel.tsx` are the viewer: full-screen dialog driven by the `attachmentDialogId` (+ `groupId`) search params via the globally-mounted `AttachmentDialogHandler` — deep-linkable, reload-safe, back-button closes it; slide navigation rewrites the param with `replace: true`. Those param keys and the shared dialog chrome live in `dialog/params.ts`; don't spell them out again. `render/` lazy-loads per-mime renderers (pan/zoom image, audio, video, react-pdf); unsupported types get a "download to view" placeholder.

## Upload paths

Two entry points, one pipeline:

1. **Table upload button** → `useAttachmentsUploadDialog` opens the shared Uppy uploader (`modules/common/uploader`): max 20 files, 10MB each by default, any type, with webcam / screen-capture / audio / URL-import plugins. On assembly completion, `helpers/parse-uploaded.ts` turns Transloadit results into attachment inputs (shared `groupId` when >1 file, name = filename minus extension, converted/thumbnail keys correlated by upload id), and the rows are created through `useAttachmentCreateMutation`.
2. **BlockNote file panel** (`modules/common/blocknote/custom-file-panel/uppy-upload-panel.tsx`) for image/video/audio/file blocks: one file per block. The block stores the attachment id (private) or cloud key (public) as its URL; the host form later persists the parsed attachments with those same ids (`helpers/persist-attachments.ts`), so block references stay valid. BlockNote resolves refs through `blocknote/helpers/resolve-file-url.ts` (a thin wrapper over `resolveBlockNoteFileRef`) and opens the same carousel imperatively (no URL binding).

**One id, minted early.** `onBeforeFileAdded` assigns `file.meta.attachmentId` the moment a file is picked. That id keys the local blob, rides through Transloadit as `user_meta.attachmentId`, and becomes the attachment row's id. Everything downstream depends on this holding: the upload-status badge, raw-blob eviction, blob deletion with the entity, and not re-downloading a file you just uploaded all work by looking the blob up _by row id_. If you build your own Uppy instance, pass that meta.

In both paths the raw file is stored locally _before_ upload, then uploaded via Tus; offline or without cloud config the upload is intercepted and the blob stays local (`pending` / `local-only`) for the upload service to push later. Because creates go through the mutation, an offline upload also leaves an optimistic row in cache and replays the create on reconnect (or after a reload, via the persisted mutation queue) — and since the blob shares the row's id, that row renders from local bytes in the meantime.

## Statuses

- Blob upload status (per local blob): `pending → uploading → uploaded | failed`, or `local-only` when no cloud is configured. Surfaced by `useBlobUploadStatus` as the thumbnail badge. `uploaded` is also stamped on blobs that were _downloaded_ (it effectively means "exists in cloud").
- Download-queue status (per attachment): `pending → downloading → downloaded | failed`, or `skipped` (too large / excluded type / no key yet). `failed` and `skipped`-for-no-key are revived by `enqueue`, not by the service — see the dedupe-registry note above.
- Row optimism: rows created by `createOptimisticEntity` carry `_optimistic`; `isPersisted()` (`types.ts`) gates cloud operations (presigned URLs, download queueing) on real rows.

## Permissions & limits

Backend enforces everything: org admins get full CRUD, members create/read ( `shared/config/permissions-config.ts`); presigned-URL signing is permission-checked and fails closed; tenant quota (default 100 attachments) returns 429 on create. The frontend currently gates only inline rename on `can.attachment.update`. Upload restrictions come from `appConfig.uppy.defaultRestrictions`; local-cache behavior from `appConfig.localBlobStorage` (enabled flag, per-file/total size caps, content-type filters, concurrency, retry delays).

## Known gaps

The full analysis is in `.todos/ATTACHMENTS_REFACTOR.md`; what is still open, in rough order of user impact:

- **Failed uploads are a dead end.** `processPendingUploads` only selects `pending`, so a `failed` blob is never retried and no UI offers retry or discard. The backoff bookkeeping it would need (`nextRetryAt`, `uploadAttempts`, `localBlobStorage.uploadRetryAttempts`) is written on every failure and read by nobody. Downloads got their retry (see above); uploads still need theirs.
- **Delete affordances ignore permissions.** Members see delete buttons the backend will reject; only inline rename checks `can.attachment.update`, and the upload button is gated by a route-level hardcoded `canUpload = true`. The backend's `splitByPermission` returns `rejectedIds` that the frontend discards, so a denied row disappears optimistically and returns on next sync.
- **Locally-cached files lose their download/open affordances.** The dialog's toolbar buttons render only for `isCDNUrl(...)`, so they vanish once a file resolves to a local `blob:` URL — including for unsupported mime types, whose "download to view" placeholder then has nothing to click. `DownloadCell` always fetches from cloud, so it fails offline even when the blob is local.
- **The offline cache is invisible and unmanageable.** Fully automatic, hard stop at 100MB/org with no LRU, no storage meter, no clear-cache control (only sign-out), and no user-facing indicator of download state — `useBlobUploadStatus` reflects upload state only.
- **BlockNote vs table divergence.** The BlockNote carousel has no URL binding, so no deep link, back-button, or shareable URL. `resolveBlockNoteFileRef` returns an object URL it cannot revoke (no lifecycle to hang it on), so re-resolving inline media leaks blob URLs.
- **Quota/size failures surface after the bytes are already in the bucket:** the tenant quota is enforced at row creation (429), by which point Transloadit has stored the file.
- Smaller: deep-linking a dialog on a non-org route spins forever; opening the dialog doesn't mark the attachment seen (only table-row visibility does); `delete-attachments.tsx` reads `attachments[0]` and would throw on an empty array.

Absent by design (candidate roadmap, not bugs): global drag-drop/paste upload, copy-link/share, undo delete, offline force-download ("keep offline" pin), storage management UI, editing metadata beyond `name`.
