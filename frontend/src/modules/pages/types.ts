import type z from 'zod';
import type { pagesRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type PagesRouteSearchParams = z.infer<typeof pagesRouteSearchParamsSchema>;
