# Attachment storage keys must name the organization's own storage

## What & why

`createAttachments` refuses (400 `invalid_request`, `meta.reason: 'storage_key'`) a `keys` value outside the organization's upload prefix `<organizationId>/…` and a `bucketName` other than `appConfig.s3.privateBucket` or `publicBucket` for the row's `publicBucket`. `getPresignedUrls` rejects stored rows that fail the same check, and `getUploadToken` refuses an `organizationId` the user is not a member of. Checks: `backend/src/modules/attachment/helpers/storage-key.ts`. The backend signed client-chosen keys, so a user could sign another tenant's file.

## Blast radius

Sync-breaking only for apps that store attachments elsewhere: a changed Transloadit `path` in `backend/src/lib/transloadit.ts`, rows written with other keys, or tests creating attachments with made-up buckets such as `test-bucket`. An app on the template upload flow is unaffected. No database or cache change.

## Run

No script: manual.

## Manual steps

1. Tests that create attachments through the API: key them under `${organizationId}/…` with `bucketName: appConfig.s3.privateBucket` (as `backend/tests/security/cross-tenant.test.ts` does).
2. A custom upload path keeps `<organizationId>/` as its first segment, or adapts `isOrganizationKey`.
3. Existing rows outside the prefix (pre-production data): rewrite their keys, or accept that they no longer presign.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/storage-keys.test.ts
pnpm check
```
