import { zGetAttachmentsQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { attachmentDialogParam, attachmentGroupParam } from '~/modules/attachment/dialog/params';

/** Default list view state: the single source for URL stripping and default-view detection. */
export const attachmentsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const attachmentsRouteSearchParamsSchema = zGetAttachmentsQuery.pick({ q: true }).extend({
  sort: zGetAttachmentsQuery.shape.sort.catch(attachmentsSearchDefaults.sort),
  order: zGetAttachmentsQuery.shape.order.catch(attachmentsSearchDefaults.order),
  [attachmentDialogParam]: z.string().optional(),
  [attachmentGroupParam]: z.string().optional(),
});
