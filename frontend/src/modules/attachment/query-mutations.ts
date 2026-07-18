import type { Attachment, CreateAttachmentsData, StxBase, UpdateAttachmentData } from 'sdk';
import { createAttachments, deleteAttachments, updateAttachment } from 'sdk';
import { createStxForCreate, createStxForDelete, createStxForUpdate } from '~/query/offline/stx-utils';
import type { QueryOrgContext } from '~/query/types';

type CreateAttachmentItem = CreateAttachmentsData['body'][number];
export type CreateAttachmentInput = Omit<CreateAttachmentItem, 'stx'>[];
type UpdateAttachmentFields = UpdateAttachmentData['body']['ops'];
export type UpdateAttachmentVars = { id: string; ops: UpdateAttachmentFields };

// Offline-replay variable shapes: a persisted mutation must carry tenant/org AND its stx in
// its variables — the component closure is gone after a reload, and stx minted at execution
// time would give a replay a NEW mutationId (breaking create idempotency for response-loss
// double-sends) and replay-time HLCs (letting a Monday-offline edit beat a Tuesday edit by
// someone else; LWW must arbitrate by intent time). setMutationDefaults reconstructs the
// request from variables alone; the hooks inject these transparently. The `?? createStxFor*`
// fallback keeps old persisted queues (without stx in variables) replayable.
// NOTE for the first real schema lens: the boot variables rewrite must canonicalize
// `stx.fieldTimestamps` keys when a lens renames a scalar (the server seam already does this
// for live requests).
export type CreateAttachmentVars = QueryOrgContext & { data: CreateAttachmentInput; stx?: StxBase };
export type UpdateAttachmentFullVars = QueryOrgContext & UpdateAttachmentVars & { stx?: StxBase };
export type DeleteAttachmentVars = QueryOrgContext & { attachments: Attachment[]; stx?: StxBase };

/**
 * Mutation fns shared by the interactive hooks (query.ts) and the offline-replay defaults
 * (setMutationDefaults), ensuring a mutation runs identically live or replayed.
 * Kept out of query.ts so they carry no query-client/window dependency and can be unit-tested.
 */

export async function createAttachmentsMutationFn({ tenantId, organizationId, data, stx }: CreateAttachmentVars) {
  const effectiveStx = stx ?? createStxForCreate();
  const body = data.map((item) => ({ ...item, stx: effectiveStx }));
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
  await deleteAttachments({ path: { tenantId, organizationId }, body: { ids, stx: effectiveStx } });
}
