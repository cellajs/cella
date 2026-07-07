import { createFileRoute } from '@tanstack/react-router';
import { operationsQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/route-utils';
import { appTitle } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OperationsTable = lazyNamed(
  () => import('~/modules/docs/operations/operations-table/operations-table'),
  'OperationsTable',
);

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
