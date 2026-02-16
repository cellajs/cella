import type z from 'zod';
import type { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';

export type RequestsRouteSearchParams = z.infer<typeof requestsRouteSearchParamsSchema>;
