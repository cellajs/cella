# Attachment placement seam v2

## What & why

The attachment placement seam (`backend/src/modules/attachment/helpers/attachment-placement.ts`,
pinned, app-filled) only carried the create-body placement fields. Apps that home attachments
below the organization still edited cella-owned files around it: the list op and schema for a
home-channel filter, the frontend delta fetch and upload path to carry the home id, the create
input type for nullable placement columns, the table definition for ancestor foreign keys and
indexes, the seed, and the sequence test. The seam now covers all of that, and a config key says
which channels offer a direct upload.

New seam exports (cella ships the org-homed defaults; apps replace the file):

- `attachmentHomeColumnKey`: the column list reads compile the grant scope against
  (`'organizationId'` by default, `'projectId'` for a project-homed app).
- `resolveAttachmentHomeScope(ctx, channelId)`: validates the `channelId` list/delta query param
  as one of the app's home channels and returns it; the default accepts only the organization.
- `seedAttachmentPlacements(db, organizations)`: where the attachment seed homes its rows; return
  `[]` to skip seeding.
- `ResolvedAttachmentPlacement` may carry `publicAt` so an app inherits the home channel's
  public-read flag server-side instead of accepting it from the client.

Cella-owned changes that read the seam or the hierarchy:

- `attachmentListQuerySchema.channelId` (optional) replaces app-specific params like `projectId`;
  the frontend delta fetch passes the covering channel id through it.
- `channelRelationColumns` now adds a lazy `references` to every non-root ancestor and related
  channel through the pinned `backend/src/db/channel-tables.ts` map (one lazy getter per channel
  type; `satisfies Record<ChannelEntityType, ...>` makes a missing channel a compile error), and
  `channelRelationIndexes(tableName, table, entityType)` emits one index per such column. The
  root keeps the composite `(tenant_id, organization_id)` foreign key declared on the table. A
  runtime registry would not do: drizzle-kit loads every `*-db.ts` in isolation.
- `appConfig.attachmentUploadTargets` (`['organization']`): channels whose attachments table shows
  the upload button and whose editors persist inline media. Apps whose attachments only come from
  host media blocks declare `[]`.
- Frontend: `CreateAttachmentInput` accepts the app's placement keys nullable and omits null from
  the wire body; `parseUploadedAttachments` and `useAttachmentsUploadDialog` take an optional
  `placement`; `AttachmentsTableBar` derives it from the channel it renders for.
- `recalculate-sequence.test.ts` leaves nullable ancestors null.

## Blast radius

Sync-breaking for apps that filled the seam: the pinned seam file must export the new members
before `pnpm check` passes. Apps that declared ancestor foreign keys or indexes by hand on the
attachments table must delete them or `pnpm generate` emits duplicate constraints. An app whose
sub-organization attachment columns had no foreign key yet gets one from the registry: one
additive migration. Wire: `GET /attachments?projectId=` style params become `channelId`. No cache
bump (cached rows are unchanged).

## Run

No script — manual.

## Manual steps

1. `shared/config/config.default.ts`: add `attachmentUploadTargets`. `['organization']` keeps
   today's behavior; `[]` for apps whose attachments come only from host media blocks (then delete
   the fork edits in `attachments-bar.tsx`, `attachments-table.tsx` and
   `update-organization-details-form.tsx` that removed the upload affordance).
2. Create the pinned `backend/src/db/channel-tables.ts` from cella's and add one lazy getter per
   channel type (`project: () => projectsTable`, ...); add it to `pinned` in `cella/cella.config.ts`.
   Product tables that declared ancestor foreign keys by hand drop them (same constraint names).
3. Extend the pinned `attachment-placement.ts` with `attachmentHomeColumnKey`,
   `resolveAttachmentHomeScope` and `seedAttachmentPlacements` (see cella's default for the
   contract). Move any `publicAt` inheritance from the client body into
   `resolveAttachmentPlacement`.
4. Take upstream for `attachment-schema.ts`, `get-attachments.ts`, `attachment-db.ts`,
   `20-attachment.seed.ts`, `recalculate-sequence.test.ts`, `frontend/.../query.ts`,
   `query-mutations.ts`, `parse-uploaded.ts`, `persist-attachments.ts`,
   `use-attachments-upload-dialog.tsx`, `attachments-bar.tsx`, `attachments-table.tsx` and
   `update-organization-details-form.tsx`; unpin the ones the app had pinned. Remove hand-declared
   ancestor `index(...)`/`foreignKey(...)` entries from `attachment-db.ts`.
5. Frontend callers that passed a home id to `parseUploadedAttachments` pass it as the
   `placement` object (`{ projectId }`) instead.

## Verify

```sh
pnpm generate
pnpm sdk
pnpm check
pnpm test:core
```

`pnpm generate` must emit at most one additive migration (new ancestor foreign keys and indexes)
and never a drop. In a running app, upload from a sub-organization channel's attachments table and
confirm the created row carries that channel's id column.
