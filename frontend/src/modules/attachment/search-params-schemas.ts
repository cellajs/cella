import { zGetAttachmentsQuery } from 'sdk/zod.gen';
import z from 'zod';

/** Default list view state: the single source for URL stripping and default-view detection. */
export const attachmentsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const attachmentsRouteSearchParamsSchema = zGetAttachmentsQuery
  .pick({ q: true, sort: true, order: true })
  .extend({
    attachmentDialogId: z.string().optional(),
    groupId: z.string().optional(),
  });
