# Batch presigned URLs replace the single presign endpoint

## What & why

`GET /{tenantId}/{organizationId}/attachments/presigned-url` (`getPresignedUrl`) is replaced by
`POST /{tenantId}/{organizationId}/attachments/presigned-urls` (`getPresignedUrls`), which signs up
to 50 `{ attachmentId, variant }` items in one call: one RLS read (`findAttachmentsByIds`), one
`checkAccessBatch` pass, N local signatures. Missing and denied ids merge into a uniform
`rejectedIds` list, closing the 403-vs-404 existence oracle the single endpoint had. On the
frontend, `getPrivateFileUrlById` now delegates to a coalescer
(`frontend/src/modules/attachment/presign-batch.ts`) that merges concurrent requests into one batch
call, dedupes identical in-flight pairs, and memoizes signed URLs for an hour, so grids resolve
with a single request and repeat views of the same file need no call at all. Backend symbols
removed: `getPresignedUrlOp`, `findAttachmentById`, `presignedUrlQuerySchema` (superseded by
`getPresignedUrlsOp`, `findAttachmentsByIds`, `presignedUrlsBodySchema` + `presignedUrlItemSchema`).

## Blast radius

Fork-breaking for any fork code that calls the removed SDK function `getPresignedUrl` or imports
the removed backend symbols. Bumps `clientCacheVersion` (`v6-batch-presigned-urls`). No database
change. A fork whose presign call sites are only the synced cella files (`file-url.ts`,
`resolve-url.ts`, `download-service.ts`, attachment table/carousel) gets everything through the
sync pull and has nothing to do beyond the checks below. Forks that widened `findAttachmentById`
locally (or carry a pre-hardening copy without the `deletedAt` filter) should adopt the new
`findAttachmentsByIds`, which keeps the `isNull(deletedAt)` guard so soft-deleted rows are never
signed.

## Run

No script. Manual; these greps find every site.

```sh
grep -rn "getPresignedUrl\b\|getPresignedUrlOp\|findAttachmentById\|presignedUrlQuerySchema" \
  --include="*.ts" --include="*.tsx" backend/src frontend/src
```

## Manual steps

1. Frontend calls of `getPresignedUrl({ path, query })` -> `getPresignedUrls({ path, body: { items: [{ attachmentId, variant }] } })`,
   or preferably route them through `getPrivateFileUrlById` / `getCloudUrl` so they inherit the
   coalescer's batching and memo.
2. Backend imports of `getPresignedUrlOp` / `findAttachmentById` / `presignedUrlQuerySchema` ->
   the batch twins listed above. `selectVariantKey` stays private to the batch op.
3. Rejection handling: a denied or missing id is no longer an HTTP 403/404; it appears in
   `rejectedIds` on a 200 response. Client code catching per-id failures should catch
   `PresignRejectedError` from `~/modules/attachment/presign-batch` (permanent; do not retry).
4. Bump your fork's `clientCacheVersion` if it overrides the default config.

## Verify

```sh
pnpm sdk
pnpm check
pnpm test
```
