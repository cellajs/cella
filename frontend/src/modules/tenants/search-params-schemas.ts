import { zGetTenantsQuery } from 'sdk/zod.gen';
import type { z } from 'zod';

/**
 * Search params schema for the tenants route.
 * Limit and offset are handled by the table component, not URL params.
 */
export const tenantsRouteSearchParamsSchema = zGetTenantsQuery.pick({ q: true, sort: true, order: true, status: true });

export type TenantsRouteSearchParams = z.infer<typeof tenantsRouteSearchParamsSchema>;
