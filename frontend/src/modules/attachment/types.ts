import type { Attachment } from 'sdk';
import type z from 'zod';
import type { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';

export type AttachmentsRouteSearchParams = z.infer<typeof attachmentsRouteSearchParamsSchema>;

/**
 * True if the attachment is persisted server-side. Optimistic rows (`createOptimisticEntity`)
 * carry `_optimistic: true` and must not be queued for cloud ops (presigned URLs, downloads).
 */
export function isPersisted(attachment: Attachment): boolean {
  return !('_optimistic' in attachment);
}
