import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { operationsQueryOptions } from '~/modules/docs/query';
import { operationsRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';
import { stripParams } from '~/utils/strip-search-params';

const OperationsPage = lazy(() => import('~/modules/docs/operations/operations-page'));

/**
 * Operations route - shows operations list view.
 */
export const Route = createFileRoute('/_public/_content/docs/operations')({
  staticData: { isAuth: false },
  validateSearch: operationsRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('schemaTag')],
  },
  head: () => ({ meta: [{ title: appTitle('Operations') }] }),
  loader: async () => {
    await queryClient.ensureQueryData(operationsQueryOptions);
  },
  component: withSuspense(OperationsPage),
});
