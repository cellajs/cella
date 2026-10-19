import type { Attachment } from 'sdk';
import { attachmentCreateOptions } from '~/modules/attachment/query';
import { createStxForCreate } from '~/query/offline/stx-utils';
import { queryClient } from '~/query/query-client';

/**
 * Persists BlockNote attachments through the queued create mutation, the one the upload table uses: optimistic rows now,
 * and offline a paused create that replays on reconnect or after a reload, so the block's id never points at no row.
 */
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
): void {
  if (!attachments.length) return;
  const data = placement ? attachments.map((attachment) => ({ ...attachment, ...placement })) : attachments;
  const mutation = queryClient.getMutationCache().build(queryClient, attachmentCreateOptions(queryClient));
  // The mutation's onError already reports a failed create.
  mutation.execute({ tenantId, organizationId, data, stx: createStxForCreate() }).catch(() => {});
}
