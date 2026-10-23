import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { operationsQueryOptions } from '~/modules/docs/query';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';

const OperationsTable = lazyNamed(() => import('~/modules/docs/operations/operations-table/operations-table'), 'OperationsTable');

/** Sibling view of the operations route: the trailing underscore keeps it un-nested. */
export const Route = createFileRoute('/_public/_content/docs/operations_/table')({
  staticData: { isAuth: false },
  head: () => pageHead(i18n.t('c:operations_table')),
  loader: async () => {
    await queryClient.query(operationsQueryOptions);
  },
  component: withSuspense(OperationsTable),
});
