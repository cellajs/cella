# Attachment module

Attachments are file uploads (images, video, audio, PDFs, anything else) scoped to an organization, in two distinct parts:

- the **entity row**: metadata in Postgres (`Attachment` in the sdk), replicated to the client through entity sync (canonical org query + SSE + delta fetch)
- the **file bytes**: in S3 via Transloadit processing, optionally mirrored into a local per-user IndexedDB blob store for offline viewing.

## File variants

Transloadit produces up to four cloud objects per file, stored as one `keys` map on the row (`Partial<Record<variant, string>>`, `original` always present): `original`, `converted` (e.g. HEIC→JPEG, with `convertedContentType`), `preview` (mid-size inline preview / doc-video poster) and `thumbnail` (tiny grid-cell image). The local blob store adds a local-only fifth, `raw`: the untouched user file, stored before upload. Variant vocabulary: `BlobVariant` in `offline/attachments-db.ts`.

## Layers

| Layer | File | Responsibility |
| --- | --- | --- |
| Query | `query.ts` | One canonical flat query per org (`['attachment','list',orgId]`) kept fresh by sync; the table's default view is a `select` on it; any other filter/sort switches to a server-filtered infinite query. `useGroupAttachments` derives upload groups (`groupId`) from it. |
| Mutations | `query-mutations.ts` | Optimistic hooks with rollback; mutation functions live apart from hooks so persisted offline mutations replay identically after reload (`tests/attachment-replay.test.ts`). |
| Offline schema | `offline/attachments-db.ts` | Schema; resolves tables from the active `localUserDb` (throws while signed out: guard with `getLocalUserDb()`). |
| Blob storage | `offline/storage-service.ts` (`attachmentStorage`) | Blob CRUD; variant fallback chains (display `converted → original → raw`, previews `preview → original → raw`, thumbnails `thumbnail → preview → original → raw`); raw-blob eviction once a durable variant exists; per-org storage accounting. |
| Download queue | `offline/download-queue.ts` | State machine for background caching (statuses below; skip filters and priority from `appConfig.localBlobStorage`). Doubles as the **dedupe registry**: a `downloaded` or `skipped` row stops re-fetching on every list refresh, so rows are never garbage-collected. Only `enqueue` revives them: `skipped`-for-no-key once its key arrives, `failed` while `attempts < downloadRetryAttempts`. Rows are dropped only when the attachment is deleted (`downloadQueue.remove`). |
| Download service | `offline/download-service.ts` | Started in `~/query/provider.tsx`. Enqueues every attachment appearing in a list query, fetches variants (thumbnail first) and stores them, capped at `maxTotalSize` per org (default 100MB), `video/*` excluded by default. |
| Upload service | `offline/upload-service.ts` | Started alongside it. Pushes local `pending` blobs to Transloadit (headless Uppy, fresh token per upload) every 60s and on reconnect; without cloud config, blobs become `local-only`. |
| Cloud URLs | `file-url.ts` | Owns the public-vs-private branch: public → CDN URL from the key; private → presigned URL requested by attachment id + variant (the client never submits a storage key). Use `getCloudUrl`; never re-derive the branch. |
| URL resolution | `helpers/resolve-url.ts` | `resolveAttachmentUrl`: local blob first, cloud fallback, enqueues a background download. `resolveBlockNoteFileRef`: same for editor blocks. |
| URL hooks | `hooks/use-attachment-url.ts`, `hooks/use-resolved-attachments.ts` | React bindings, single and batch (retry-before-"not found", blob-URL lifecycle). |
| Table | `table/` | Org grid (route `/$tenantId/$orgSlug/organization/attachments`): thumbnail with upload-status badge, inline rename, description cell whose editor is the sheet (double click, Enter or the hover pencil; text selectable in place), per-row cloud download, bulk delete with confirmation, seen-marking via row visibility. |
| Description | `attachment-description-sheet.tsx` | `CollaborativeBlockNote` in a sheet (`collaborativeProduct: 'attachment'`, the backend op is the Yjs materializer); organization members feed the mention menu. Mentions are derived server-side into `mentions` and fan out as notifications: the template's consumer of the notifications contract, the shape apps copy for their products. |
| Viewer | `dialog/`, `attachments-carousel.tsx` | Full-screen dialog driven by the `attachmentDialogId` (+ `groupId`) search params via the globally mounted `AttachmentDialogHandler`: deep-linkable, reload-safe, back button closes it; slide navigation rewrites the param with `replace: true`. The caption shows the description text and opens the editor sheet (closing the dialog first: sheets stack below dialogs). Param keys and dialog chrome: `dialog/params.ts`, never spelled out elsewhere. |
| Renderers | `render/` | Lazy per-mime renderers (pan/zoom image, audio, video, react-pdf); unsupported types show a "download to view" placeholder. |

## Upload paths

1. **Table upload button** → `useAttachmentsUploadDialog` opens the shared Uppy uploader (`modules/common/uploader`): max 20 files, 10MB each by default, any type, webcam / screen-capture / audio / URL-import plugins. On assembly completion `helpers/parse-uploaded.ts` turns Transloadit results into attachment inputs (shared `groupId` when >1 file, name = filename minus extension, converted/preview/thumbnail keys correlated by upload id); rows are created via `useAttachmentCreateMutation`.
2. **BlockNote file panel** (`modules/common/blocknote/custom-file-panel/uppy-upload-panel.tsx`) for image/video/audio/file blocks: one file per block. The block stores the attachment id (private) or cloud key (public) as its URL; the host form persists the parsed attachments under those ids (`helpers/persist-attachments.ts`) so block references stay valid. Refs resolve through `blocknote/helpers/resolve-file-url.ts` (wraps `resolveBlockNoteFileRef`); the carousel opens imperatively (no URL binding).

**One id, minted early.** `onBeforeFileAdded` assigns `file.meta.attachmentId` when a file is picked. That id keys the local blob, rides through Transloadit as `user_meta.attachmentId`, and becomes the row id; the upload-status badge, raw-blob eviction, blob deletion with the entity, and skipping re-download of a just-uploaded file all look the blob up by it. A custom Uppy instance must pass that meta.

Both paths store the raw file locally before the Tus upload. Creates go through the mutation, so an offline upload leaves an optimistic row in cache and replays the create on reconnect or after a reload (persisted mutation queue); the row renders from local bytes meanwhile.

## Statuses

- Blob upload status (per local blob): `pending → uploading → uploaded | failed`, or `local-only` without cloud config; `useBlobUploadStatus` feeds the thumbnail badge. Downloaded blobs are also stamped `uploaded` ("exists in cloud").
- Download-queue status (per attachment): `pending → downloading → downloaded | failed`, or `skipped` (too large / excluded type / no key yet).
- Row optimism: rows from `createOptimisticEntity` carry `_optimistic`; `isPersisted()` (`types.ts`) gates cloud operations (presigned URLs, download queueing) on real rows.

## Permissions & limits

Backend enforces everything: org admins full CRUD, members create/read (`shared/config/permissions-config.ts`); presigned-URL signing is permission-checked and fails closed; tenant quota (default 100 attachments) returns 429 on create. The frontend gates only inline rename, on `can.attachment.update`. Upload restrictions: `appConfig.uppy.defaultRestrictions`; local-cache behavior: `appConfig.localBlobStorage` (enabled flag, per-file/total size caps, content-type filters, concurrency, retry delays).
