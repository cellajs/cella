# Attachment module

Attachments are file uploads (images, video, audio, PDFs, anything else) scoped to an
organization. An attachment is two things that this module constantly has to keep distinct:

- the **entity row** — metadata in Postgres (`Attachment` in the sdk), replicated to the client
  through the normal entity-sync machinery (canonical org query + SSE + delta fetch), and
- the **file bytes** — stored in S3 via Transloadit processing, optionally mirrored into a local
  per-user IndexedDB blob store for offline viewing.

Everything in this module is a layer on one of those two, or glue between them.

## File variants

Transloadit processing produces up to three cloud objects per file, referenced by key fields on
the row: `originalKey` (processed original), `convertedKey` (e.g. HEIC→JPEG, with
`convertedContentType`), `thumbnailKey`. The local blob store adds a fourth, local-only variant:
`raw` — the untouched user file, stored before upload so nothing is lost offline. Variant
vocabulary lives in `dexie/attachments-db.ts` (`BlobVariant`).

## Layers

**Query layer** (`query.ts`, `query-mutations.ts`). One canonical flat query per org
(`['attachment','list',orgId]`) that sync keeps fresh; the table serves its default view from it
via `select`, and any deviating filter/sort switches to a server-filtered infinite query.
Mutation hooks are optimistic with rollback; mutation *functions* are separated into
`query-mutations.ts` so persisted offline mutations can replay identically after a reload
(`tests/attachment-replay.test.ts` locks this in). `useGroupAttachments` derives multi-file upload
groups (`groupId`) from the canonical query.

**Local blob store** (`dexie/`). `attachments-db.ts` defines the schema and resolves tables from
the per-user appdb (throws while signed out — guard with `getAppDb()`). `storage-service.ts`
(`attachmentStorage`) is the blob CRUD API: store upload/download blobs, variant fallback chains
(`converted → original → raw` for display, `thumbnail → original → raw` for thumbs), raw-blob
eviction once a durable variant exists, per-org storage accounting. `download-queue.ts` is the
state machine for background caching (`pending → downloading → downloaded/failed`, plus `skipped`
with a reason; skip filters and priority come from `appConfig.localBlobStorage`).

**Background services** (`download-service.ts`, `upload-service.ts`), started together in
`~/query/provider.tsx`. The download service watches the query cache: any attachment appearing in
a list query gets enqueued, then variants are fetched (thumbnail first) and stored locally —
automatic, capped at `maxTotalSize` per org (default 100MB), `video/*` excluded by default. It
also watches the mutation cache to delete local blobs when attachments are deleted. The upload
service pushes locally-stored `pending` blobs to Transloadit (headless Uppy, fresh token per
upload) every 60s and on reconnect; without cloud config, blobs are downgraded to `local-only`.

**URL resolution.** `file-url.ts` builds cloud URLs: public files → CDN URL from the key; private
files → presigned URL requested *by attachment id + variant* so the server resolves and signs the
key (the client never submits a storage key). `helpers/resolve-url.ts` is the engine on top:
local blob first, cloud fallback, and it opportunistically enqueues a background download.
`hooks/use-attachment-url.ts` (single) and `hooks/use-resolved-attachments.ts` (batch, with
retry-before-"not found" and blob-URL lifecycle management) are the React bindings.

**UI.** `table/` is the org attachments grid (route
`/$tenantId/$orgSlug/organization/attachments`): thumbnail with upload-status badge, inline rename
(the only editable field), per-row cloud download, bulk delete with confirmation, seen-marking via
row visibility. `dialog/` + `attachments-carousel.tsx` are the viewer: full-screen dialog driven
by the `attachmentDialogId` (+ `groupId`) search params via the globally-mounted
`AttachmentDialogHandler` — deep-linkable, reload-safe, back-button closes it; slide navigation
rewrites the param with `replace: true`. `render/` lazy-loads per-mime renderers (pan/zoom image,
audio, video, react-pdf); unsupported types get a "download to view" placeholder.

## Upload paths

There are two, and they behave differently (see gaps):

1. **Table upload button** → `useAttachmentsUploadDialog` (`table/helpers.tsx`) opens the shared
   Uppy uploader (`modules/common/uploader`): max 20 files, 10MB each by default, any type, with
   webcam / screen-capture / audio / URL-import plugins. On assembly completion,
   `helpers/parse-uploaded.ts` turns Transloadit results into attachment inputs (fresh entity ids,
   shared `groupId` when >1 file, name = filename minus extension, converted/thumbnail keys
   correlated by upload id) and the rows are created via the API.
2. **BlockNote file panel** (`modules/common/blocknote/custom-file-panel/uppy-upload-panel.tsx`)
   for image/video/audio/file blocks: one file per block. The block stores the attachment id
   (private) or cloud key (public) as its URL; the host form later persists the parsed
   attachments with those same ids (`helpers/persist-attachments.ts`), so block references stay
   valid. BlockNote resolves refs through `blocknote/helpers/resolve-file-url.ts` (local blob
   first, presigned by id otherwise) and opens the same carousel imperatively (no URL binding).

In both paths the raw file is stored in the local blob store *before* upload (keyed by the Uppy
file id), then uploaded via Tus; offline or without cloud config, upload is intercepted and the
blob stays local (`pending` / `local-only`) for the upload service to sync later.

## Statuses

- Blob upload status (per local blob): `pending → uploading → uploaded | failed`, or `local-only`
  when no cloud is configured. Surfaced by `useBlobUploadStatus` as the thumbnail badge.
  `uploaded` is also stamped on blobs that were *downloaded* (it effectively means "exists in
  cloud").
- Download-queue status (per attachment): `pending → downloading → downloaded | failed`, or
  `skipped` (too large / excluded type / no key yet — re-queued automatically once a key arrives).
- Row optimism: rows created by `createOptimisticEntity` carry `_optimistic`; `isPersisted()`
  (`types.ts`) gates cloud operations (presigned URLs, download queueing) on real rows.

## Permissions & limits

Backend enforces everything: org admins get full CRUD, members create/read (
`shared/config/permissions-config.ts`); presigned-URL signing is permission-checked and fails
closed; tenant quota (default 100 attachments) returns 429 on create. The frontend currently
gates only inline rename on `can.attachment.update`. Upload restrictions come from
`appConfig.uppy.defaultRestrictions`; local-cache behavior from `appConfig.localBlobStorage`
(enabled flag, per-file/total size caps, content-type filters, concurrency, retry delays).

## Known gaps

A full refactor/gap analysis lives in `.todos/ATTACHMENTS_REFACTOR.md`. The two structural ones to
know about before touching upload code:

1. The upload dialog creates rows via the raw SDK instead of `useAttachmentCreateMutation`, so
   offline/interrupted uploads store bytes locally but never create the entity row — the replay
   machinery exists and is tested, but is not wired up.
2. Local upload blobs are keyed by the Uppy file id while rows get fresh ids, so blob and row
   never link: upload-status badges can't appear for real rows, raw blobs are never evicted or
   deleted with their entity, and just-uploaded files get re-downloaded.
