import type z from 'zod';
import { pageRouteSearchParamsSchema, pagesRouteSearchParamsSchema } from '~/routes/search-params-schemas';

export type PagesRouteSearchParams = z.infer<typeof pagesRouteSearchParamsSchema>;
export type PageRouteSearchParams = z.infer<typeof pageRouteSearchParamsSchema>;
