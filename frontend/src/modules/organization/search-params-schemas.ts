import { zGetOrganizationsQuery } from 'sdk/zod.gen';

export const organizationsSearchDefaults = { q: '', sort: 'displayOrder', order: 'asc' } as const;

export const organizationsRouteSearchParamsSchema = zGetOrganizationsQuery.pick({ q: true, sort: true, order: true });
