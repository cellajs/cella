import { zGetOrganizationsQuery } from 'sdk/zod.gen';

/**
 * Default list view state. This is the single source for URL stripping (route search middleware)
 * and query fallbacks. Mirrors the defaults in `zGetOrganizationsQuery`: organizations sort
 * by `displayOrder` ascending, unlike other lists.
 */
export const organizationsSearchDefaults = { q: '', sort: 'displayOrder', order: 'asc' } as const;

/**
 * Search params schema for organizations route.
 */
export const organizationsRouteSearchParamsSchema = zGetOrganizationsQuery.pick({ q: true, sort: true, order: true });
