import { zListAttachmentsQuery } from 'sdk/zod.gen';
import { z } from 'zod';
import { attachmentDialogParam, attachmentGroupParam } from '~/modules/attachment/dialog/params';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

/** Default list view state: the single source for URL stripping and default-view detection. */
export const attachmentsSearchDefaults = listSearchDefaults(zListAttachmentsQuery);

export const attachmentsRouteSearchParamsSchema = listSearchSchema(zListAttachmentsQuery).extend({
  [attachmentDialogParam]: z.string().optional(),
  [attachmentGroupParam]: z.string().optional(),
});
