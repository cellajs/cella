import { zGetAttachmentsQuery } from 'sdk/zod.gen';
import z from 'zod';

/**
 * Default list view state. This is the single source for URL stripping (route search middleware)
 * and default-view detection (table serves the default view from the canonical org query).
 */
export const attachmentsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/**
 * Search params schema for attachments route.
 */
export const attachmentsRouteSearchParamsSchema = zGetAttachmentsQuery
  .pick({ q: true, sort: true, order: true })
  .extend({
    attachmentDialogId: z.string().optional(),
    groupId: z.string().optional(),
  });
