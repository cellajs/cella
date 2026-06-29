import type { Attachment } from 'sdk';
import type z from 'zod';
import type { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';

export type AttachmentsRouteSearchParams = z.infer<typeof attachmentsRouteSearchParamsSchema>;

/**
 * Returns true if the attachment has been persisted server-side.
 * Optimistic rows produced by `createOptimisticEntity` carry `_optimistic: true`
 * and must not be queued for cloud-side operations (presigned URLs, downloads).
 */
export function isPersisted(attachment: Attachment): boolean {
  return !('_optimistic' in attachment);
}
