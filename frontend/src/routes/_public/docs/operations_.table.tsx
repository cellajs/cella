import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { OperationsTable } from '~/modules/docs/operations/operations-table/operations-table';
import { operationsQueryOptions } from '~/modules/docs/query';
import { operationsTableRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { pageHead } from '~/utils/app-title';
import { stripForeignParams } from '~/utils/strip-foreign-params';

/** Sibling view of the operations route: the trailing underscore keeps it un-nested. */
export const Route = createFileRoute('/_public/docs/operations_/table')({
  validateSearch: operationsTableRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('operationTag', 'schemaTag')] },
  loader: async () => {
    await queryClient.query(operationsQueryOptions);
  },
  head: () => pageHead(i18n.t('c:operations_table')),
  component: withSuspense(OperationsTable),
});
