import { zGetRequestsQuery } from 'sdk/zod.gen';

export const requestsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const requestsRouteSearchParamsSchema = zGetRequestsQuery.pick({ q: true }).extend({
  sort: zGetRequestsQuery.shape.sort.catch(requestsSearchDefaults.sort),
  order: zGetRequestsQuery.shape.order.catch(requestsSearchDefaults.order),
});
