import { zGetRequestsQuery } from 'sdk/zod.gen';

/**
 * Default list view state — the single source for URL stripping (route search middleware)
 * and query fallbacks. Mirrors the defaults in `zGetRequestsQuery`.
 */
export const requestsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/**
 * Search params schema for requests route.
 */
export const requestsRouteSearchParamsSchema = zGetRequestsQuery.pick({ q: true, sort: true, order: true });
