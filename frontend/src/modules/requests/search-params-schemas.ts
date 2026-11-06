import { zListRequestsQuery } from 'sdk/zod.gen';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const requestsSearchDefaults = listSearchDefaults(zListRequestsQuery);

export const requestsRouteSearchParamsSchema = listSearchSchema(zListRequestsQuery);
