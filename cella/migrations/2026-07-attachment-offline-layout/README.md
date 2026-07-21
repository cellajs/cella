# Attachment module: offline layout, dead-code sweep, working offline uploads

Upstream reworked the frontend attachment module. Three kinds of change, in rising order of how much they can affect a fork:

1. **Layout + naming** (mechanical, codemod below).
2. **Dead-code removal** (compiler-enforced; a fork that used a removed export must decide).
3. **Two behaviour fixes** in the upload path — offline uploads now actually create the attachment row, and local blobs are keyed by the attachment id. **Read §3 before pulling if your fork has its own upload flow.**

---

## Does my fork need to do anything?

- **In sync with cella's attachment module (e.g. raak):** run the codemod for your own fork-local references, then the gates. Most forks touch nothing else.
- **Fork-local code importing `~/modules/attachment/dexie/*`** (likely — `attachmentStorage` and `attachments-db` are the module's most-imported files): the codemod rewrites the paths.
- **Fork-local upload flows** built on `createBaseTransloaditUppy` / `parseUploadedAttachments`: see §3, this is where real behaviour changed.

## 1. Layout and naming (codemod)

```sh
pnpm exec tsx cella/migrations/2026-07-attachment-offline-layout/attachment-paths.ts inventory frontend/src
pnpm exec tsx cella/migrations/2026-07-attachment-offline-layout/attachment-paths.ts rewrite  frontend/src
```

It rewrites an explicit import-path map and a small identifier allow-list, and reports (never rewrites) references to removed exports. Idempotent.

`dexie/` was a misnomer twice over: it named a folder after the IndexedDB wrapper while holding the module's most load-bearing domain logic, and the files inside barely touched Dexie — the real `liveQuery` usage lived outside it, in `download-service.ts`. The pipeline is now one folder:

| Was | Now |
| --- | --- |
| `attachment/dexie/{attachments-db,storage-service,download-queue}.ts` | `attachment/offline/…` |
| `attachment/download-service.ts`, `attachment/upload-service.ts` | `attachment/offline/…` |
| `attachment/dialog/handler.tsx` | `attachment/dialog/attachment-dialog-handler.tsx` |
| `attachment/dialog/helpers.tsx` | `attachment/dialog/open-attachment-dialog.tsx` |
| `attachment/table/cells.tsx` | `attachment/table/attachment-cells.tsx` |
| `attachment/table/helpers.tsx` | `attachment/table/use-attachments-upload-dialog.tsx` |
| `attachment/hooks/use-blob-sync-status.ts` | `attachment/hooks/use-blob-upload-status.ts` |
| `formatBytes` (from `table/helpers.tsx`) | `~/utils/format-bytes` |

Renamed symbols (upload vocabulary — "sync" is reserved for CDC/SSE entity replication): `syncAttempts` → `uploadAttempts`, `attemptSync` → `processPendingUploads`, `syncOrganizationUploads` → `uploadOrganizationBlobs`, `syncSingleBlob` → `uploadBlob`.

`AttachmentBlob.uploadAttempts` is an unindexed Dexie field, so **no schema migration**: existing rows simply carry no `uploadAttempts` and are read as 0.

New: `dialog/params.ts` owns the `attachmentDialogId`/`groupId` search-param keys, both param patches, and the shared dialog chrome. Use it instead of spelling the keys out.

## 2. Removed exports

Compiler-enforced — `pnpm ts` finds every site.

| Removed | What to do |
| --- | --- |
| `SyncStatusCell` (`table/sync-status-cell.tsx`, whole file) | Had no importers. Use `SyncStatusBadge` in `table/attachment-cells.tsx`, which already rendered the same states on the thumbnail. |
| `attachmentStorage.clearAll()` | Sign-out deletes the whole per-user appdb (`deleteAppDb`), which already covers this. |
| `downloadQueue.gc()` | Never called. Deliberately not revived: an org-wide sweep deletes the `downloaded`/`skipped` rows that serve as the dedupe registry, so it would cause re-download churn. Deleted attachments are now cleaned precisely via `downloadQueue.remove(ids)`. |
| `uploadService.getStatus()`, `parseBlobKey`, `attachmentStorage.hasAnyVariant()`, `attachmentStorage.markUploading()` | No callers. `markUploading` → `updateUploadStatus(id, 'uploading')`. |
| `CarouselItemData.convertedUrl` | Never assigned a URL, so `convertedUrl ?? url` always yielded `url`. Drop it; `convertedContentType` is unaffected. |
| `ResolveOptions.useFallback` / `.preferCloud` / `.queueDownload`, `useAttachmentUrl`'s `skip` | No caller ever set them. The defaults (local-first, fallback on, queue on) are now the only behaviour. |
| `RenderImage` `customButton`/`ref`/`resetImageState`, `ImageViewer` `reset()`/`onReset` | Never passed. `ReactPanZoom` is no longer a `forwardRef` component. |

Also new in `file-url.ts`: `getVariantKey(attachment, variant)` and `getCloudUrl(attachment, variant)`. The `public ? CDN : presigned-by-id` branch was written in five places; use `getCloudUrl`.

## 3. Behaviour changes in the upload path — read before pulling

Two bugs were fixed together; a fork with its own upload flow inherits the fix only if it goes through the same seams.

**Offline uploads created no attachment row.** The table's upload dialog called the raw SDK `createAttachments`, so an offline upload stored bytes locally, later pushed them to Transloadit, and never created the entity — an invisible orphan behind a generic error toast. It now goes through `useAttachmentCreateMutation`, which was already built and tested for exactly this (optimistic row, persisted variables, replay after reload) and had **zero callers**.

_If your fork calls `createAttachments` directly from an upload-complete handler, it still has this bug._ Route it through `useAttachmentCreateMutation` (or `createAttachmentsMutationFn`). `helpers/persist-attachments.ts` now delegates to that same mutation fn.

**Local blobs and attachment rows never shared an id.** Blobs were keyed by the Uppy file id (a nanoid) while rows got a fresh UUID, so nothing linked them. Consequences, all now fixed: upload status badges could never appear for a real row; just-uploaded files were immediately re-downloaded from cloud; raw blobs were never evicted or deleted with their entity, permanently consuming the org's local-storage budget.

The attachment id is now generated **before** upload and threaded through Uppy's file meta into `storeUploadBlob`. If your fork builds its own Uppy instance, pass `meta.attachmentId` (see `uploader/helpers/uppy-helpers.ts`) or call `storeUploadBlob(file, orgId, status, ctx, attachmentId)` explicitly.

`parseUploadedAttachments` now reuses the id carried in `user_meta.attachmentId` instead of minting a new one. Blobs written by an older build keep their nanoid keys; they are orphaned (their row has a different id) and will be re-downloaded from cloud on next view. Harmless, and `downloadQueue.remove` plus raw eviction keep the store bounded from here on.

**Retry semantics.** A `failed` download-queue row is no longer terminal until sign-out: `enqueue` revives it while `attempts < localBlobStorage.downloadRetryAttempts` (new config key, default 3). `transition()` still treats `failed` as terminal — reviving is an out-of-band enqueue decision, not something the service does mid-run.

## Config

`shared/config/config.default.ts` gains `localBlobStorage.downloadRetryAttempts: 3`. Forks with a copied `config.template.ts` should add it; `LocalBlobStorageConfig` makes it required, so `pnpm ts` will say so.

## i18n

`c:pending_sync` → `c:pending_upload` ("Waiting to upload"). New keys: `c:uploading`, `c:upload_failed` (both were _referenced but missing_ — the tooltips rendered raw keys), `c:zoom_in`, `c:zoom_out`, `c:rotate_right`, `c:toggle_pan_view`. `c:synced` is now unused by this module but kept for the sync engine.

## Gates

```sh
pnpm ts
pnpm lint
pnpm exec vitest run frontend/src/modules/attachment
```
