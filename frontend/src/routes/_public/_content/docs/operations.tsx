import { createFileRoute } from '@tanstack/react-router';
import { operationsQueryOptions } from '~/modules/docs/query';
import { operationsRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/_route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';
import { stripParams } from '~/utils/strip-search-params';

const OperationsPage = lazyNamed(() => import('~/modules/docs/operations/operations-page'), 'OperationsPage');

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
