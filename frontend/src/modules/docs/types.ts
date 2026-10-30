import type { z } from 'zod';
import type {
  operationSearchSchema,
  operationsRouteSearchParamsSchema,
  operationsTableRouteSearchParamsSchema,
} from '~/modules/docs/search-params-schemas';

export type OperationSearch = z.infer<typeof operationSearchSchema>;
export type OperationsRouteSearchParams = z.infer<typeof operationsRouteSearchParamsSchema>;
export type OperationsTableRouteSearchParams = z.infer<typeof operationsTableRouteSearchParamsSchema>;
