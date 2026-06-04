import { createRoute } from '@tanstack/react-router';
import { lazy } from 'react';
import {
  infoQueryOptions,
  openApiSpecQueryOptions,
  operationsQueryOptions,
  schemasQueryOptions,
  schemaTagsQueryOptions,
  tagDetailsQueryOptions,
  tagsQueryOptions,
} from '~/modules/docs/query';
import {
  operationsRouteSearchParamsSchema,
  schemasRouteSearchParamsSchema,
} from '~/modules/docs/search-params-schemas';
import { pagesListQueryOptions } from '~/modules/page/query';
import { pagesRouteSearchParamsSchema } from '~/modules/page/search-params-schemas';
import { queryClient } from '~/query/query-client';
import { PublicContentLayoutRoute } from '~/routes/base-routes';
import { DocsPageComponent, DocsPageEditComponent } from '~/routes/docs-components';
import { createErrorComponent, createNotFoundComponent, withSuspense } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { stripParams } from '~/utils/strip-search-params';

const DocsLayout = lazy(() => import('~/modules/docs/docs-layout'));
const OverviewPage = lazy(() => import('~/modules/docs/overview-page'));
const OperationsPage = lazy(() => import('~/modules/docs/operations/operations-page'));
const OperationsTable = lazy(() => import('~/modules/docs/operations/operations-table/operations-table'));
const SchemasPage = lazy(() => import('~/modules/docs/schemas/schemas-page'));
const PagesTable = lazy(() => import('~/modules/page/table/pages-table'));

/**
 * Documentation layout route for API reference and developer guides.
 */
export const DocsLayoutRoute = createRoute({
  path: '/docs',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Docs') }] }),
  beforeLoad: async () => {
    noDirectAccess(DocsLayoutRoute.to, DocsOperationsRoute.to);
  },
  getParentRoute: () => PublicContentLayoutRoute,
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  loader: async () => {
    // Prefetch tags, schemas (used for error response deduplication), and pages
    const [tags] = await Promise.all([
      queryClient.ensureQueryData(tagsQueryOptions),
      queryClient.ensureQueryData(schemasQueryOptions),
      queryClient.prefetchInfiniteQuery(pagesListQueryOptions({})),
    ]);
    // Eagerly prefetch tag details so child routes don't waterfall (skip empty tags)
    for (const tag of tags) {
      if (tag.count > 0) queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name));
    }
  },
  component: withSuspense(DocsLayout),
});

/**
 * Operations route - shows operations list view.
 */
export const DocsOperationsRoute = createRoute({
  path: '/operations',
  staticData: { isAuth: false },
  validateSearch: operationsRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('schemaTag')],
  },
  head: () => ({ meta: [{ title: appTitle('Operations') }] }),
  getParentRoute: () => DocsLayoutRoute,
  loader: async () => {
    await queryClient.ensureQueryData(operationsQueryOptions);
  },
  component: withSuspense(OperationsPage),
});

/**
 * Operations table route - shows operations in a table format.
 */
export const DocsOperationsTableRoute = createRoute({
  path: '/operations/table',
  staticData: { isAuth: false },
  getParentRoute: () => DocsLayoutRoute,
  head: () => ({ meta: [{ title: appTitle('Operations table') }] }),
  loader: async () => {
    // Prefetch operations for table view
    await queryClient.ensureQueryData(operationsQueryOptions);
  },
  component: withSuspense(OperationsTable),
});

/**
 * Overview route - shows OpenAPI info in a table format and spec in JSON viewer.
 */
export const DocsOverviewRoute = createRoute({
  path: '/overview',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('API overview') }] }),
  getParentRoute: () => DocsLayoutRoute,
  loader: async () => {
    // Prefetch info and OpenAPI spec used by OverviewTable and OpenApiSpecViewer
    await Promise.all([
      queryClient.ensureQueryData(infoQueryOptions),
      queryClient.ensureQueryData(openApiSpecQueryOptions),
    ]);
  },
  component: withSuspense(OverviewPage),
});

/**
 * Schemas list route - displays all API schemas.
 */
export const DocsSchemasRoute = createRoute({
  path: '/schemas',
  staticData: { isAuth: false },
  validateSearch: schemasRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('operationTag')],
  },
  head: () => ({ meta: [{ title: appTitle('Schemas') }] }),
  getParentRoute: () => DocsLayoutRoute,
  loader: async () => {
    // Prefetch schemas and schema tags used by SchemasPage and SchemasSidebar
    await Promise.all([
      queryClient.ensureQueryData(schemasQueryOptions),
      queryClient.ensureQueryData(schemaTagsQueryOptions),
    ]);
  },
  component: withSuspense(SchemasPage),
});

/**
 * Pages table route - manages documentation pages.
 */
export const DocsPagesRoute = createRoute({
  path: '/pages',
  validateSearch: pagesRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('operationTag', 'schemaTag')],
  },
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Pages') }] }),
  getParentRoute: () => DocsLayoutRoute,
  component: withSuspense(PagesTable),
});

/**
 * View page route - displays an individual documentation page.
 */
export const DocsPageRoute = createRoute({
  path: '/page/$id',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Page') }] }),
  getParentRoute: () => DocsLayoutRoute,
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageComponent,
});

/**
 * Edit page route - displays the page edit form.
 */
export const DocsPageEditRoute = createRoute({
  path: '/page/$id/edit',
  staticData: { isAuth: true },
  head: () => ({ meta: [{ title: appTitle('Edit Page') }] }),
  getParentRoute: () => DocsLayoutRoute,
  errorComponent: createErrorComponent('public', '/docs'),
  notFoundComponent: createNotFoundComponent('public', '/docs'),
  component: DocsPageEditComponent,
});
