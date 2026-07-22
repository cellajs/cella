import type { Attachment } from 'sdk';
import { createAttachmentsMutationFn } from '~/modules/attachment/query-mutations';

/**
 * Persist parsed BlockNote attachments under their stable client IDs through the shared mutation.
 * The imperative path preserves hook-equivalent timestamping and offline replay.
 */
export async function persistAttachments(
  attachments: Attachment[],
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!attachments.length) return;
  await createAttachmentsMutationFn({ tenantId, organizationId, data: attachments });
}
