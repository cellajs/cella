# Attachment variant keys collapse to a single jsonb map

## What & why

The `attachments` columns `originalKey`, `convertedKey`, `thumbnailKey`, `thumbnailTinyKey`
collapse into one `keys` jsonb map (`AttachmentKeys`: `{ original, preview?, thumbnail?, converted? }`);
a lookup is `attachment.keys[variant]` and the variant set lives in `attachmentKeysSchema`
(`backend/src/modules/attachment/attachment-schema.ts`). Variants renamed: mid-size `thumbnail` ->
`preview`, grid-cell `thumbnail-tiny` -> `thumbnail`; `attachmentVariantSchema` and the frontend
`BlobVariant` are `original | preview | thumbnail | converted`.

## Blast radius

Sync-breaking. Wire: four `*Key` fields removed, `keys` added, variant enum renamed;
`clientCacheVersion` bumped to `v8-attachment-keys`. DB: four `*_key` columns dropped,
`keys jsonb NOT NULL DEFAULT '{}'` added with a backfill. Every reader of the old `*Key` fields or
`thumbnail-tiny` is affected. App-owned `taskId`/`projectId` homing columns are untouched.

## Run

No script, manual.

## Manual steps

1. `attachment-db.ts`: replace the `originalKey`/`convertedKey`/`thumbnailKey`/`thumbnailTinyKey`
   `varchar` columns with `keys: jsonb().$type<AttachmentKeys>().notNull().default({})`; import
   `AttachmentKeys` (type-only) from `attachment-schema`.
2. `attachment-schema.ts`: add `attachmentKeysSchema`/`AttachmentKeys`; pass `{ keys: attachmentKeysSchema }`
   as the refinement to `createInsertSchema`/`createSelectSchema`; one `keys` field doc replaces the
   four `*Key` docs; pick `keys` (not the `*Key` fields) in the create body and require it via
   `.extend({ keys: attachmentKeysSchema })`; `attachmentVariantSchema` becomes
   `z.enum(['original', 'preview', 'thumbnail', 'converted'])`; drop the `originalKey` update op.
3. Remap every reader (`thumbnail` -> `preview`, `thumbnail-tiny` -> `thumbnail`): `get-presigned-urls.ts`
   (`keys[variant] ?? keys.original`), `create-attachments.ts` (drop the per-key coalesce), mocks,
   seeds, security tests, and on the frontend `file-url.ts`, `helpers/resolve-url.ts`,
   `helpers/parse-uploaded.ts`, `hooks/use-attachment-url.ts`, `hooks/use-resolved-attachments.ts`,
   `offline/attachments-db.ts` (`BlobVariant`), `offline/download-queue.ts`, `offline/download-service.ts`,
   `offline/storage-service.ts`, `table/attachment-cells.tsx`, and the uppy upload panel.
4. `parse-uploaded.ts`: keep your Transloadit step names but map them to the new variants
   (`thumb_image_tiny` -> `keys.thumbnail`, other `thumb_*` -> `keys.preview`, `converted_*` -> `keys.converted`);
   if you also rename the Transloadit steps, update the server-side template too.
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
