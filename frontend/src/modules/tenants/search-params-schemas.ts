import { zGetTenantsQuery } from 'sdk/zod.gen';
import type { z } from 'zod';

/**
 * Default list view state — the single source for URL stripping (route search middleware)
 * and query fallbacks. Mirrors the defaults in `zGetTenantsQuery`.
 */
export const tenantsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/**
 * Search params schema for the tenants route.
 * Limit and offset are handled by the table component, not URL params.
 */
export const tenantsRouteSearchParamsSchemas = zGetTenantsQuery.pick({
  q: true,
  sort: true,
  order: true,
  status: true,
});

export type TenantsRouteSearchParams = z.infer<typeof tenantsRouteSearchParamsSchemas>;
