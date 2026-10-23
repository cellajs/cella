import type { Attachment, CreateAttachmentsData, UpdateAttachmentData } from 'sdk';
import { createAttachments, deleteAttachments, updateAttachment } from 'sdk';
import { zCreateAttachmentsBody } from 'sdk/zod.gen';
import { type AncestorChannelType, appConfig, type EntityIdColumnKey, hierarchy } from 'shared';
import type { CreateVariables, DeleteVariables, UpdateVariables } from '~/query/offline/mutation-variables';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
/** Id keys of the sub-organization ancestors an app homes attachments under (none in cella); null means org-homed. */
type PlacementKey = EntityIdColumnKey<Exclude<AncestorChannelType<'attachment'>, 'organization'>>;
const placementKeys: readonly string[] = hierarchy
  .getOrderedAncestors('attachment')
  .filter((type) => type !== 'organization')
  .map((type) => appConfig.entityIdColumnKeys[type]);

// Placement keys keep the row's own nullability: a strict ancestor stays `string`, so an optimistic row validates.
export type CreateAttachmentInput = (Omit<CreateAttachmentItem, 'stx' | PlacementKey> & Partial<Pick<Attachment, PlacementKey>>)[];
type UpdateAttachmentFields = UpdateAttachmentData['body']['ops'];
export type UpdateAttachmentVars = { id: string; ops: UpdateAttachmentFields };

export type CreateAttachmentVars = CreateVariables<CreateAttachmentInput[number]>;
export type UpdateAttachmentFullVars = UpdateVariables<UpdateAttachmentFields>;
export type DeleteAttachmentVars = DeleteVariables<Attachment>;

/** The keys a create row takes. An edit of any other field, such as the description, cannot fold into a queued create. */
export const attachmentCreateKeys = Object.keys(zCreateAttachmentsBody.element.shape);

export async function createAttachmentsMutationFn({ tenantId, organizationId, data, stx }: CreateAttachmentVars) {
  const effectiveStx = stx ?? createStxForCreate();
  const body = data.map((item) => {
    const row: Record<string, unknown> = { ...item, stx: effectiveStx };
    for (const key of placementKeys) if (row[key] == null) delete row[key];
    return row as CreateAttachmentItem;
  });
  return createAttachments({ path: { tenantId, organizationId }, body });
}

export async function updateAttachmentMutationFn({ tenantId, organizationId, id, ops, stx }: UpdateAttachmentFullVars) {
  const scalarFieldNames = ops ? Object.keys(ops) : [];
  const effectiveStx = stx ?? createStxForUpdate(scalarFieldNames);
  return updateAttachment({ path: { tenantId, organizationId, id }, body: { ops, stx: effectiveStx } });
}

export async function deleteAttachmentsMutationFn({ tenantId, organizationId, rows, stx }: DeleteAttachmentVars) {
  const ids = rows.map((row) => row.id);
  const effectiveStx = stx ?? createStxForDelete();
  return deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx: effectiveStx } });
}
