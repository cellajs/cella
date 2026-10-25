import { zGetTenantsQuery } from 'sdk/zod.gen';

export const tenantsSearchDefaults = { q: '', sort: 'createdAt', order: 'desc' } as const;

/** Limit and offset stay out of the URL: the list query options page the rows. */
export const tenantsRouteSearchParamsSchema = zGetTenantsQuery.pick({ q: true, sort: true, order: true, status: true });
