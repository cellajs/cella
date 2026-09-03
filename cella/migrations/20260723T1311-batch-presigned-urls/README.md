# Batch presigned URLs replace the single presign endpoint

## What & why

`GET /{tenantId}/{organizationId}/attachments/presigned-url` (`getPresignedUrl`) is replaced by
`POST /{tenantId}/{organizationId}/attachments/presigned-urls` (`getPresignedUrls`): up to 50
`{ attachmentId, variant }` items per call (one RLS read via `findAttachmentsByIds`, one
`checkAccessBatch` pass, N local signatures); missing and denied ids merge into `rejectedIds`,
closing the 403-vs-404 existence oracle. Frontend `getPrivateFileUrlById` delegates to the
coalescer in `frontend/src/modules/attachment/presign-batch.ts` (batches concurrent requests,
dedupes in-flight pairs, memoizes signed URLs for an hour). Removed: `getPresignedUrlOp`,
`findAttachmentById`, `presignedUrlQuerySchema`; superseded by `getPresignedUrlsOp`,
`findAttachmentsByIds`, `presignedUrlsBodySchema` + `presignedUrlItemSchema`.

## Blast radius

Sync-breaking for app code calling the removed SDK function `getPresignedUrl` or the removed
backend symbols. Bumps `clientCacheVersion` (`v6-batch-presigned-urls`). No database change. Apps
whose presign sites are only synced cella files (`file-url.ts`, `resolve-url.ts`,
`download-service.ts`, attachment table/carousel) need nothing beyond the checks. Apps that widened
`findAttachmentById` (or lack the `deletedAt` filter) adopt `findAttachmentsByIds`, which keeps the
`isNull(deletedAt)` guard.

## Run

No script; these greps find every site:

```sh
grep -rn "getPresignedUrl\b\|getPresignedUrlOp\|findAttachmentById\|presignedUrlQuerySchema" \
  --include="*.ts" --include="*.tsx" backend/src frontend/src
```

## Manual steps

1. Frontend `getPresignedUrl({ path, query })` -> `getPresignedUrls({ path, body: { items: [{ attachmentId, variant }] } })`,
   or preferably `getPrivateFileUrlById` / `getCloudUrl` to inherit batching and memo.
2. Backend imports of `getPresignedUrlOp` / `findAttachmentById` / `presignedUrlQuerySchema` -> the
   batch twins above; `selectVariantKey` stays private to the batch op.
3. A denied or missing id is an entry in `rejectedIds` on a 200, not HTTP 403/404; catch
   `PresignRejectedError` from `~/modules/attachment/presign-batch` (permanent; do not retry).
4. Bump `clientCacheVersion` if your app overrides the default config.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```
