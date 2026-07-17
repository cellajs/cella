import type { Attachment } from 'sdk';
import { createAttachmentsMutationFn } from '~/modules/attachment/query-mutations';

/**
 * Persist already-parsed attachments as real entities (BlockNote's `public-attachment` /
 * `private-attachment` modes). They keep their client-generated ids, so a BlockNote block written
 * on upload that references those ids stays valid after persistence.
 *
 * Imperative rather than a mutation hook: the caller is a form submit handler, not a component
 * render. It still shares `createAttachmentsMutationFn` with the hook and the offline-replay
 * defaults, so the request (and its stx stamping) is identical however it is reached.
 */
export async function persistAttachments(
  attachments: Attachment[],
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!attachments.length) return;
  await createAttachmentsMutationFn({ tenantId, organizationId, data: attachments });
}
