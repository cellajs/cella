---
syncBreaking: true
clientCacheBump: false
---

# Attachment files: uploader-owned keys, purge after delete, offline tiers

Run `pnpm generate` for `attachments.purged_at` and the `attachments_purge_pending_index`. A create now takes only keys
under the uploader's own `<organizationId>/<userId>/` prefix and checks each against the bucket, so app code or tests
that register other keys change. `localBlobStorage.maxTotalSize` in the app's `shared/config` now caps one device across
organizations: raise it (the template's is 1 GB).

## What & why

`createAttachmentsOp` holds keys to the uploader's prefix (`namesOwnStorage`) and reads each from storage
(`storedFileSize`), taking the size from there. The jobs worker's `attachment-files-purge` deletes a deleted
attachment's files after a day; `organization.deleted` (now dispatched) deletes the organization's prefix. Machines get
no upload token, so `createAttachments` is no MCP tool any more. The download service keeps what the device's offline
files tier allows, set in account settings.

## Blast radius

Sync-breaking: a database migration, and app code or tests that create attachments with keys outside the uploader's
prefix. Apps with an MCP client that called `createAttachments` lose that tool. No client cache bump, no lens.

## Run

No script: manual.

## Manual steps

1. Run `pnpm generate`; commit the schema migration it writes.
2. In `shared/config/config.default.ts` (and `config.template.ts` if the app keeps one), raise `localBlobStorage.maxTotalSize` to the budget of the "All files" tier on one device.
3. Grep app tests and seeds for `createAttachments` bodies whose keys name `<organizationId>/uploads/` or another user's id; use `<organizationId>/<uploader id>/...`, or a local `blob:` key when the file does not matter.
4. An app delete path that removes organizations without `deleteOrganizationsOp` dispatches `organization.deleted` with the deleted rows, or its files stay in storage.

## Verify

```sh
pnpm generate
pnpm --filter backend test
pnpm check
```
