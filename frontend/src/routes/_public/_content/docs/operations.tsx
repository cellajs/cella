import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { operationsQueryOptions } from '~/modules/docs/query';
import { operationsRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';
import { stripForeignParams } from '~/utils/strip-foreign-params';

const OperationsPage = lazyNamed(() => import('~/modules/docs/operations/operations-page'), 'OperationsPage');

export const Route = createFileRoute('/_public/_content/docs/operations')({
  staticData: { isAuth: false },
  validateSearch: operationsRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('schemaTag')] },
  head: () => pageHead(i18n.t('c:operation_other')),
  loader: async () => {
    await queryClient.query(operationsQueryOptions);
  },
  component: withSuspense(OperationsPage),
});
