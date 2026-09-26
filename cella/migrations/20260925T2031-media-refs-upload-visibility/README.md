# One media reference grammar; the server decides upload visibility

## What & why

`parseMediaRef` (`shared/src/utils/media-ref.ts`) accepts an attachment id, a key under the document's organization,
or an asset on `mediaAssetOrigin`; everything else renders nothing. `trusted-media-domains.json` is gone. Upload
templates declare `publicBucket`; the client flag is removed and attachment rows are stamped private. Newsletter images
use a system-admin `newsletter` template.

## Blast radius

Sync-breaking for every app: `shared/config` is app-owned, and content with external image URLs stops rendering.
No database change.

## Run

No script: manual.

## Manual steps

1. Add `mediaAssetOrigin: ''` to `config.default.ts`.
2. In `transloadit-config.ts`, set `publicBucket: true` on avatar and cover, `false` on attachment, and add the `newsletter` template and id.
3. Pass the entity's `organizationId` to `assertBlockMediaUrls` and `sanitizeBlockMediaUrls`.
4. Drop `publicBucket` from `getUploadToken` and `createAttachments` calls.
5. In the Transloadit workspace, turn on "Require a correct Signature": the server-decided visibility and key prefix hold only for signed assemblies.

## Verify

```sh
pnpm vitest run --project=backend backend/tests/security/block-media-refs.test.ts backend/tests/security/upload-visibility.test.ts
pnpm check
```
