import { z } from 'zod';

/**
 * Search params schema for the tenants route.
 * Note: limit and offset are handled by the table component, not URL params.
 */
export const tenantsRouteSearchParamsSchema = z.object({
  q: z.string().optional(),
  status: z.enum(['active', 'suspended', 'archived']).optional(),
  sort: z.enum(['createdAt', 'name']).optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

export type TenantsRouteSearchParams = z.infer<typeof tenantsRouteSearchParamsSchema>;
