import type { z } from 'zod';
import type { tenantsRouteSearchParamsSchema } from '~/modules/tenants/search-params-schemas';

export type TenantsRouteSearchParams = z.infer<typeof tenantsRouteSearchParamsSchema>;
