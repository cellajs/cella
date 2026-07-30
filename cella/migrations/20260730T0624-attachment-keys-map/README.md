# Attachment variant keys collapse to a single jsonb map

## What & why

The `attachments` table stored one storage-object key per variant in four columns:
`originalKey`, `convertedKey`, `thumbnailKey`, `thumbnailTinyKey`. Signing and resolution had to
enumerate variant names at every call site. These collapse into a single `keys` jsonb map
(`AttachmentKeys`: `{ original, preview?, thumbnail?, converted? }`) so a variant lookup is
`attachment.keys[variant]` and the variant set is enumerated in exactly one place
(`attachmentKeysSchema` in `backend/src/modules/attachment/attachment-schema.ts`).

The variant vocabulary is realigned in the same change: the old mid-size `thumbnail` becomes
`preview` and the old grid-cell `thumbnail-tiny` becomes `thumbnail`. So `attachmentVariantSchema`
and the frontend `BlobVariant` are now `original | preview | thumbnail | converted`.

## Blast radius

Sync-breaking: yes. The attachment wire shape changes (four `*Key` fields removed, `keys` added; the
variant enum is renamed), so `clientCacheVersion` is bumped to `v8-attachment-keys`. Database: yes,
the four `*_key` columns are dropped and a `keys jsonb NOT NULL DEFAULT '{}'` column is added, with a
data backfill. Every reader of the old `*Key` fields or the `thumbnail-tiny` variant is affected. An
app that re-homes attachments on a product entity (its own `taskId`/`projectId` columns) is otherwise
unaffected: only the keys map and variant vocabulary are upstream, not the homing columns.

## Run

No script: manual. The change is field-specific (a jsonb collapse plus a variant rename) and carries a
data-preserving DB migration, so there is no codemod.

## Manual steps

1. `attachment-db.ts`: replace the `originalKey`/`convertedKey`/`thumbnailKey`/`thumbnailTinyKey`
   `varchar` columns with `keys: jsonb().$type<AttachmentKeys>().notNull().default({})`. Import
   `AttachmentKeys` (type-only) from `attachment-schema`.
2. `attachment-schema.ts`: add `attachmentKeysSchema`/`AttachmentKeys`; pass `{ keys: attachmentKeysSchema }`
   as the refinement to `createInsertSchema`/`createSelectSchema`; replace the four `*Key` field docs with
   one `keys` doc; pick `keys` (not the `*Key` fields) in the create body and require it via
   `.extend({ keys: attachmentKeysSchema })`; rename `attachmentVariantSchema` to
   `z.enum(['original', 'preview', 'thumbnail', 'converted'])`. Drop the now-absent `originalKey` update op.
3. Update every reader of the old fields to the map, applying the variant remap
   (`thumbnail` -> `preview`, `thumbnail-tiny` -> `thumbnail`): `get-presigned-urls.ts`
   (`keys[variant] ?? keys.original`), `create-attachments.ts` (drop the per-key coalesce), the mocks,
   seeds, security tests, and on the frontend `file-url.ts`, `helpers/resolve-url.ts`,
   `helpers/parse-uploaded.ts`, `hooks/use-attachment-url.ts`, `hooks/use-resolved-attachments.ts`,
   `offline/attachments-db.ts` (`BlobVariant`), `offline/download-queue.ts`, `offline/download-service.ts`,
   `offline/storage-service.ts`, `table/attachment-cells.tsx`, and the uppy upload panel.
4. `parse-uploaded.ts`: keep your Transloadit step names but map them to the new variants
   (`thumb_image_tiny` -> `keys.thumbnail`, other `thumb_*` -> `keys.preview`, `converted_*` -> `keys.converted`).
   If you also rename the Transloadit steps to match the vocabulary, update the server-side template too.
5. DB migration: run `pnpm generate`, answer "create column" for `keys` (not a rename), then edit the
   generated `migration.sql` to backfill before the drops:
   ```sql
   UPDATE "attachments" SET "keys" = jsonb_strip_nulls(jsonb_build_object(
     'original', "original_key", 'converted', "converted_key",
     'preview', "thumbnail_key", 'thumbnail', "thumbnail_tiny_key"));
   ```
6. Bump `clientCacheVersion` in `shared/config/config.default.ts`.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
```
