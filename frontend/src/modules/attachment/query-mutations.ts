import type { Attachment, CreateAttachmentsData, StxBase, UpdateAttachmentData } from 'sdk';
import { createAttachments, deleteAttachments, updateAttachment } from 'sdk';
import { type AncestorChannelType, appConfig, type EntityIdColumnKey, hierarchy, type RootChannelType } from 'shared';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import type { QueryOrgContext } from '~/query/types';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
/**
 * Placement seam: id keys of the sub-organization ancestors an app homes attachments under (none in
 * cella). Cached rows carry them nullable, so creates accept them as-is and omit null (org-homed)
 * from the wire body; optimistic `Attachment` rows thus remain valid create input.
 */
type PlacementKey = EntityIdColumnKey<Exclude<AncestorChannelType<'attachment'>, RootChannelType>>;
const placementKeys = hierarchy
  .getOrderedAncestors('attachment')
  .filter((type) => type !== hierarchy.rootChannelType)
  .map((type) => appConfig.entityIdColumnKeys[type]) as readonly string[];

// Placement keys keep the row's own nullability: a strict ancestor stays `string`, so an optimistic row validates.
export type CreateAttachmentInput = (Omit<CreateAttachmentItem, 'stx' | PlacementKey> &
  Partial<Pick<Attachment, PlacementKey>>)[];
type UpdateAttachmentFields = UpdateAttachmentData['body']['ops'];
export type UpdateAttachmentVars = { id: string; ops: UpdateAttachmentFields };

export type CreateAttachmentVars = QueryOrgContext & { data: CreateAttachmentInput; stx?: StxBase };
export type UpdateAttachmentFullVars = QueryOrgContext & UpdateAttachmentVars & { stx?: StxBase };
export type DeleteAttachmentVars = QueryOrgContext & { attachments: Attachment[]; stx?: StxBase };

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

export async function deleteAttachmentsMutationFn({
  tenantId,
  organizationId,
  attachments,
  stx,
}: DeleteAttachmentVars) {
  const ids = attachments.map((a) => a.id);
  const effectiveStx = stx ?? createStxForDelete();
  return deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx: effectiveStx } });
}
