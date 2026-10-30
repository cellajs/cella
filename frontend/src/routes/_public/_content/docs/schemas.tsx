import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { schemasRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/-route-utils';
import { pageHead } from '~/utils/app-title';
import { lazyNamed } from '~/utils/lazy-named';
import { stripForeignParams } from '~/utils/strip-foreign-params';

const SchemasPage = lazyNamed(() => import('~/modules/docs/schemas/schemas-page'), 'SchemasPage');

export const Route = createFileRoute('/_public/_content/docs/schemas')({
  staticData: { isAuth: false },
  validateSearch: schemasRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('operationTag', 'q', 'filter', 'sort', 'order')] },
  head: () => pageHead(i18n.t('c:schema_other')),
  loader: async () => {
    await Promise.all([queryClient.query(schemasQueryOptions), queryClient.query(schemaTagsQueryOptions)]);
  },
  component: withSuspense(SchemasPage),
});
