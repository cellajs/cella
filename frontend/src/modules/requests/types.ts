import type z from 'zod';
import type { GetRequestsResponse } from '~/api.gen';
import type { requestsRouteSearchParamsSchema } from '~/modules/requests/search-params-schemas';

export type Request = GetRequestsResponse['items'][number];

export type RequestsRouteSearchParams = z.infer<typeof requestsRouteSearchParamsSchema>;
