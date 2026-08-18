import { zGetRequestsQuery } from 'sdk/zod.gen';

export const requestsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

export const requestsRouteSearchParamsSchema = zGetRequestsQuery.pick({ q: true, sort: true, order: true });
