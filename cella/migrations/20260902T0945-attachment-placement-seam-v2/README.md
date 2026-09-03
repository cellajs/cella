# Attachment placement seam v2

## What & why

The pinned seam `backend/src/modules/attachment/helpers/attachment-placement.ts` now covers
everything apps homing attachments below the organization used to patch into cella-owned files.
New exports (apps replace the file): `attachmentHomeColumnKey`
(grant-scope column for list reads: `'organizationId'` default, `'projectId'` for a project-homed
app); `resolveAttachmentHomeScope(ctx, channelId)` (validates the `channelId` list/delta query
param as an app home channel; default accepts only the organization);
`seedAttachmentPlacements(db, organizations)` (where the seed homes its rows; `[]` skips seeding).
The default fill is hierarchy-derived (deepest home id required when that ancestor is strict,
optional when nullable, a second id rejected as ambiguous, the chain above the home read off the
resolved row); `publicAt` is accepted on create (client-sent, row-local; the upload path stamps the
home channel's value as default).

Cella-owned: `attachmentListQuerySchema.channelId` (optional) replaces app params like `projectId`;
`channelRelationColumns` adds a lazy `references` per non-root ancestor and related channel through
the pinned `backend/src/db/channel-tables.ts` map (one lazy getter per channel type,
`satisfies Record<ChannelEntityType, ...>`), `channelRelationIndexes(tableName, table, entityType)`
emits one index per such column (the root keeps its composite `(tenant_id, organization_id)`
foreign key); `appConfig.attachmentUploadTargets` (`['organization']`) lists channels with an
upload button and inline-media editors; `CreateAttachmentInput` accepts placement keys nullable and
omits null from the wire; `parseUploadedAttachments` and `useAttachmentsUploadDialog` take an
optional `placement`.

## Blast radius

Sync-breaking for apps that filled the seam: the pinned file must export the new members before
`pnpm check` passes. Hand-declared ancestor foreign keys or indexes on the attachments table must
go or `pnpm generate` emits duplicates; a sub-organization column without a foreign key gets one
(additive). Wire: `GET /attachments?projectId=` becomes `channelId`. No cache bump.

## Run

No script: manual.

## Manual steps

1. `shared/config/config.default.ts`: add `attachmentUploadTargets` (`['organization']` keeps
   today's behavior; `[]` for apps fed only by host media blocks, then delete the fork edits in
   `attachments-bar.tsx`, `attachments-table.tsx` and `update-organization-details-form.tsx` that
   removed the upload affordance).
2. Create the pinned `backend/src/db/channel-tables.ts` from cella's, one lazy getter per channel
   type (`project: () => projectsTable`, ...); add it to `pinned` in `cella/cella.config.ts`.
   Product tables drop hand-declared ancestor foreign keys (same constraint names).
3. Take cella's `attachment-placement.ts`, keeping only what the derived defaults do not cover
   (typically `seedAttachmentPlacements`). Apps that inherited `publicAt` server-side send it from
   the client.
4. Take upstream for `attachment-schema.ts`, `get-attachments.ts`, `attachment-db.ts`,
   `20-attachment.seed.ts`, `recalculate-sequence.test.ts`, `frontend/.../query.ts`,
   `query-mutations.ts`, `parse-uploaded.ts`, `persist-attachments.ts`,
   `use-attachments-upload-dialog.tsx`, `attachments-bar.tsx`, `attachments-table.tsx`,
   `update-organization-details-form.tsx`; unpin any the app had pinned; remove hand-declared
   ancestor `index(...)`/`foreignKey(...)` entries from `attachment-db.ts`.
5. Callers passing a home id to `parseUploadedAttachments` pass it as `placement` (`{ projectId }`).

## Verify

```sh
pnpm generate   # at most one additive migration (ancestor foreign keys and indexes), never a drop
pnpm sdk
pnpm check
pnpm test:core
# then upload from a sub-organization channel's attachments table: the row carries that channel's id column
```
