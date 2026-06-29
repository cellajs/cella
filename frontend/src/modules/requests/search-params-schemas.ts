import { zGetRequestsQuery } from 'sdk/zod.gen';

/**
 * Search params schema for requests route.
 */
export const requestsRouteSearchParamsSchema = zGetRequestsQuery.pick({ q: true, sort: true, order: true });
