import { zListTenantsQuery } from 'sdk/zod.gen';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const tenantsSearchDefaults = listSearchDefaults(zListTenantsQuery);

/** Paging stays out of the URL: the list query options page the rows. */
export const tenantsRouteSearchParamsSchema = listSearchSchema(zListTenantsQuery).extend({
  status: zListTenantsQuery.shape.status.catch(undefined),
});
