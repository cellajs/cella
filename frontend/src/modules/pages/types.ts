import type z from 'zod';
import type { pagesRouteSearchParamsSchema } from '~/modules/pages/search-params-schemas';

export type PagesRouteSearchParams = z.infer<typeof pagesRouteSearchParamsSchema>;
