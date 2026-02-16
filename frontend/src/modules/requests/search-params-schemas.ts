import { zGetRequestsData } from '~/api.gen/zod.gen';

/**
 * Search params schema for requests route.
 */
export const requestsRouteSearchParamsSchema = zGetRequestsData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });
