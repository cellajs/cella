import type z from 'zod';
import type { pagesRouteSearchParamsSchema } from '~/modules/page/search-params-schemas';

export type PagesRouteSearchParams = z.infer<typeof pagesRouteSearchParamsSchema>;
