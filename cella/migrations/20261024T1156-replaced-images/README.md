---
syncBreaking: true
clientCacheBump: false
---

# Replaced images leave storage

An app operation that updates a channel's `thumbnailUrl` or `bannerUrl` calls `releaseReplacedImages`
(`backend/src/modules/attachment/operations/release-replaced-images.ts`) after its write, with the channel's
organization as owner, the row as it was, and the values written.

## What & why

Replacing or clearing an avatar or cover left the old object in the public bucket, readable by its URL. `updateMeOp`,
`updateUserOp` and `updateOrganizationOp` now call `releaseReplacedImages`. It deletes an image under the owner's own
prefix that no live attachment names. Account deletion clears `actors.last_seen_at` and `last_sign_in_at`, and Yjs
compaction stores no deleted text.

## Blast radius

Apps whose channel types have their own update operation and let users set images. Sync-breaking only in that their
images keep leaking until the call is added. No database migration, no client cache bump.

## Run

No script: manual.

## Manual steps

1. In each app operation that writes `thumbnailUrl` or `bannerUrl` of a channel, call
   `releaseReplacedImages({ owner: { organizationId, tenantId }, before: row, after: input })` after the write.

## Verify

```sh
pnpm --filter backend test
pnpm check
```
