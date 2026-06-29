import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { operationsQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

const OperationsTable = lazy(() => import('~/modules/docs/operations/operations-table/operations-table'));

/**
 * Operations table route - shows operations in a table format.
 * Not nested under the operations route (trailing underscore) — it is a sibling view.
 */
export const Route = createFileRoute('/_public/_content/docs/operations_/table')({
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Operations table') }] }),
  loader: async () => {
    // Prefetch operations for table view
    await queryClient.ensureQueryData(operationsQueryOptions);
  },
  component: withSuspense(OperationsTable),
});
