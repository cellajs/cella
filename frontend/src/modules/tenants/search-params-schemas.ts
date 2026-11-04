import { zGetTenantsQuery } from 'sdk/zod.gen';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const tenantsSearchDefaults = listSearchDefaults(zGetTenantsQuery);

/** Limit and offset stay out of the URL: the list query options page the rows. */
export const tenantsRouteSearchParamsSchema = listSearchSchema(zGetTenantsQuery).extend({
  status: zGetTenantsQuery.shape.status.catch(undefined),
});
