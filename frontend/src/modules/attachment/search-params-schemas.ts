import { zGetAttachmentsQuery } from 'sdk/zod.gen';
import z from 'zod';

/**
 * Search params schema for attachments route.
 */
export const attachmentsRouteSearchParamsSchema = zGetAttachmentsQuery
  .pick({ q: true, sort: true, order: true })
  .extend({
    attachmentDialogId: z.string().optional(),
    groupId: z.string().optional(),
  });
