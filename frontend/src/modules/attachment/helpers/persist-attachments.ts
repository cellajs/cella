import type { Attachment } from 'sdk';
import { createAttachmentsMutationFn } from '~/modules/attachment/query-mutations';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { queryClient } from '~/query/query-client';

/** Persists BlockNote attachments and splices the confirmed rows into the home list: the own-create realtime echo only patches rows in place. */
export async function persistAttachments(
  attachments: Attachment[],
  { tenantId, organizationId }: { tenantId: string; organizationId: string },
): Promise<void> {
  if (!attachments.length) return;
  const result = await createAttachmentsMutationFn({ tenantId, organizationId, data: attachments });
  insertEntitiesIntoHome(queryClient, result.data);
}
