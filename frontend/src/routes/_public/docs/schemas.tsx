import { createFileRoute } from '@tanstack/react-router';
import i18n from 'i18next';
import { withSuspense } from '~/modules/common/with-suspense';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { SchemasPage } from '~/modules/docs/schemas/schemas-page';
import { schemasRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { pageHead } from '~/utils/app-title';
import { stripForeignParams } from '~/utils/strip-foreign-params';

export const Route = createFileRoute('/_public/docs/schemas')({
  validateSearch: schemasRouteSearchParamsSchema,
  search: { middlewares: [stripForeignParams('operationTag', 'q', 'filter', 'sort', 'order')] },
  loader: async () => {
    await Promise.all([queryClient.query(schemasQueryOptions), queryClient.query(schemaTagsQueryOptions)]);
  },
  head: () => pageHead(i18n.t('c:schema_other')),
  component: withSuspense(SchemasPage),
});
