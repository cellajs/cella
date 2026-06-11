import { createFileRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import { schemasQueryOptions, schemaTagsQueryOptions } from '~/modules/docs/query';
import { schemasRouteSearchParamsSchema } from '~/modules/docs/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';
import { stripParams } from '~/utils/strip-search-params';

const SchemasPage = lazy(() => import('~/modules/docs/schemas/schemas-page'));

/**
 * Schemas list route - displays all API schemas.
 */
export const Route = createFileRoute('/_public/_content/docs/schemas')({
  staticData: { isAuth: false },
  validateSearch: schemasRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('operationTag')],
  },
  head: () => ({ meta: [{ title: appTitle('Schemas') }] }),
  loader: async () => {
    // Prefetch schemas and schema tags used by SchemasPage and SchemasSidebar
    await Promise.all([
      queryClient.ensureQueryData(schemasQueryOptions),
      queryClient.ensureQueryData(schemaTagsQueryOptions),
    ]);
  },
  component: withSuspense(SchemasPage),
});
