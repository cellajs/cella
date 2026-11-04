import { zGetRequestsQuery } from 'sdk/zod.gen';
import { listSearchDefaults, listSearchSchema } from '~/modules/common/search-params-schemas';

export const requestsSearchDefaults = listSearchDefaults(zGetRequestsQuery);

export const requestsRouteSearchParamsSchema = listSearchSchema(zGetRequestsQuery);
