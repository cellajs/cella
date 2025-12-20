import type z from 'zod';
import { pagesRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type PagesRouteSearchParams = z.infer<typeof pagesRouteSearchParamsSchema>;
