import { onlineManager } from '@tanstack/react-query';
import type { Attachment } from 'sdk';
import { attachmentCreateOptions } from '~/modules/attachment/query';
import { createStxForCreate } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';

/** Persists attachments through the upload table's queued create, so a block's id never points at no row; resolves once created, or at once while offline. */
export function persistAttachments(
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
  if (!attachments.length) return Promise.resolve();
  const data = placement ? attachments.map((attachment) => ({ ...attachment, ...placement })) : attachments;
  const mutation = queryClient.getMutationCache().build(queryClient, attachmentCreateOptions(queryClient));
  const created = mutation.execute({ tenantId, organizationId, data, stx: createStxForCreate() }).then(() => {});
  // The mutation's onError already reports a failed create.
  created.catch(() => {});
  // Offline the create waits paused for its replay: queued is as far as a caller waits
  return onlineManager.isOnline() ? created : Promise.resolve();
}
