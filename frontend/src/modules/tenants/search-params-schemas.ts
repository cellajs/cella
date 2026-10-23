import { zGetTenantsQuery } from 'sdk/zod.gen';
import type { z } from 'zod';

export const tenantsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/** Limit and offset stay out of the URL: the list query options page the rows. */
export const tenantsRouteSearchParamsSchemas = zGetTenantsQuery.pick({ q: true, sort: true, order: true, status: true });

export type TenantsRouteSearchParams = z.infer<typeof tenantsRouteSearchParamsSchemas>;
