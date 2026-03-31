import { zGetOrganizationsData } from 'sdk/zod.gen';

/**
 * Search params schema for organizations route.
 */
export const organizationsRouteSearchParamsSchema = zGetOrganizationsData.shape.query
  .unwrap()
  .pick({ q: true, sort: true, order: true });
