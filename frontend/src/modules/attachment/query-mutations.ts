import type { Attachment, BatchCreateAttachmentsData, UpdateAttachmentData } from 'sdk';
import { batchCreateAttachments, batchDeleteAttachments, updateAttachment } from 'sdk';
import { zBatchCreateAttachmentsBody } from 'sdk/zod.gen';
import { appConfig, type EntityIdColumnKey, type HomeChannelType, hierarchy } from 'shared';
import type { CreateVariables, DeleteVariables, UpdateVariables } from '~/query/offline/mutation-variables';

type CreateAttachmentItem = BatchCreateAttachmentsData['body'][number];
/** Id keys of the sub-organization ancestors an app homes attachments under (none in cella); null means org-homed. */
type PlacementKey = EntityIdColumnKey<HomeChannelType<'attachment'>>;
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
export const attachmentCreateKeys = Object.keys(zBatchCreateAttachmentsBody.element.shape);

export async function createAttachmentsMutationFn({ tenantId, organizationId, data, stx }: CreateAttachmentVars) {
  const body = data.map((item) => {
    const row: Record<string, unknown> = { ...item, stx };
    for (const key of placementKeys) if (row[key] == null) delete row[key];
    return zBatchCreateAttachmentsBody.element.parse(row);
  });
  return batchCreateAttachments({ path: { tenantId, organizationId }, body });
}

export const updateAttachmentMutationFn = async ({ tenantId, organizationId, id, ops, stx }: UpdateAttachmentFullVars) =>
  updateAttachment({ path: { tenantId, organizationId, attachmentId: id }, body: { ops, stx } });

export const deleteAttachmentsMutationFn = async ({ tenantId, organizationId, rows, stx }: DeleteAttachmentVars) =>
  batchDeleteAttachments({ path: { tenantId, organizationId }, body: { ids: rows.map((row) => row.id), stx } });
