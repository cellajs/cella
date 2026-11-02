import { zGetOrganizationsQuery } from 'sdk/zod.gen';

export const organizationsSearchDefaults = { q: '', sort: 'displayOrder', order: 'asc' } as const;

export const organizationsRouteSearchParamsSchema = zGetOrganizationsQuery.pick({ q: true }).extend({
  sort: zGetOrganizationsQuery.shape.sort.catch(organizationsSearchDefaults.sort),
  order: zGetOrganizationsQuery.shape.order.catch(organizationsSearchDefaults.order),
});
