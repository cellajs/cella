import {
  type Attachment,
  type CreateAttachmentsData,
  createAttachments,
  deleteAttachments,
  type UpdateAttachmentData,
  updateAttachment,
} from 'sdk';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import type { QueryOrgContext } from '~/query/types';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
export type CreateAttachmentInput = Omit<CreateAttachmentItem, 'stx'>[];
type UpdateAttachmentFields = UpdateAttachmentData['body']['ops'];
export type UpdateAttachmentVars = { id: string; ops: UpdateAttachmentFields };

// Offline-replay variable shapes: a persisted mutation must carry tenant/org in its variables
// because the component closure that supplied them is gone after a reload — setMutationDefaults
// reconstructs the request from variables alone. The hooks inject these transparently.
export type CreateAttachmentVars = QueryOrgContext & { data: CreateAttachmentInput };
export type UpdateAttachmentFullVars = QueryOrgContext & UpdateAttachmentVars;
export type DeleteAttachmentVars = QueryOrgContext & { attachments: Attachment[] };

/**
 * Mutation fns shared by the interactive hooks (query.ts) and the offline-replay defaults
 * (setMutationDefaults) — one implementation so a mutation runs identically live or replayed.
 * Kept out of query.ts so they carry no query-client/window dependency and can be unit-tested.
 */

export async function createAttachmentsMutationFn({ tenantId, organizationId, data }: CreateAttachmentVars) {
  const stx = createStxForCreate();
  const body = data.map((item) => ({ ...item, stx }));
  return createAttachments({ path: { tenantId, organizationId }, body });
}

export async function updateAttachmentMutationFn({ tenantId, organizationId, id, ops }: UpdateAttachmentFullVars) {
  const scalarFieldNames = ops ? Object.keys(ops) : [];
  const stx = createStxForUpdate(scalarFieldNames);
  return updateAttachment({ path: { tenantId, organizationId, id }, body: { ops, stx } });
}

export async function deleteAttachmentsMutationFn({ tenantId, organizationId, attachments }: DeleteAttachmentVars) {
  const ids = attachments.map((a) => a.id);
  const stx = createStxForDelete();
  await deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx } });
}
