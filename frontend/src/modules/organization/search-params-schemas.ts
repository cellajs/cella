import { zGetOrganizationsQuery } from 'sdk/zod.gen';

/**
 * Search params schema for organizations route.
 */
export const organizationsRouteSearchParamsSchema = zGetOrganizationsQuery.pick({ q: true, sort: true, order: true });
