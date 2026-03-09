import type z from 'zod';
import type { attachmentsRouteSearchParamsSchema } from '~/modules/attachment/search-params-schemas';

export type AttachmentsRouteSearchParams = z.infer<typeof attachmentsRouteSearchParamsSchema>;
