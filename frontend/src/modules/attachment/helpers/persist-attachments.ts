import type { Attachment } from 'sdk';
import { createAttachmentsMutationFn } from '~/modules/attachment/query-mutations';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { queryClient } from '~/query/query-client';

/**
 * Persist parsed BlockNote attachments under their stable client IDs through the shared mutation fn.
 * The confirmed rows are spliced into the canonical home list, mirroring the create mutation's
 * onSuccess: the own-create realtime echo only patches rows in place, so without this splice the
 * attachment stays invisible to list consumers until the next refetch.
 */
export async function persistAttachments(
  attachments: Attachment[],
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!attachments.length) return;
  const result = await createAttachmentsMutationFn({ tenantId, organizationId, data: attachments });
  insertEntitiesIntoHome(queryClient, result.data);
}
