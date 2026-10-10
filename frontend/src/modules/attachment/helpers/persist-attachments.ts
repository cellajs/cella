import type { Attachment } from 'sdk';
import { createAttachmentsMutationFn } from '~/modules/attachment/query-mutations';
import { insertEntitiesIntoHome } from '~/query/basic/apply-entity-to-lists';
import { queryClient } from '~/query/query-client';

/** Persists BlockNote attachments and splices the confirmed rows into the home list: the own-create realtime echo only patches rows in place. */
export async function persistAttachments(
  attachments: Attachment[],
  {
    tenantId,
    organizationId,
    placement,
  }: {
    tenantId: string;
    organizationId: string;
    /** The deepest home channel id only (ancestors are server-derived); omitted = org-homed. The fields a create accepts follow the hierarchy (`placementFieldsSchema`). */
    placement?: Record<string, string | null | undefined>;
  },
): Promise<void> {
  if (!attachments.length) return;
  const rows = placement ? attachments.map((attachment) => ({ ...attachment, ...placement })) : attachments;
  const result = await createAttachmentsMutationFn({ tenantId, organizationId, data: rows });
  insertEntitiesIntoHome(queryClient, result.data);
}
