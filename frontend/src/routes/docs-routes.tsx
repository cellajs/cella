import { createRoute, useParams } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { ErrorNotice } from '~/modules/common/error-notice';
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
import { PublicLayoutRoute } from '~/routes/base-routes';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { stripParams } from '~/utils/strip-search-params';

const DocsLayout = lazy(() => import('~/modules/docs/docs-layout'));
const OverviewPage = lazy(() => import('~/modules/docs/overview-page'));
const OperationsPage = lazy(() => import('~/modules/docs/operations/operations-page'));
const OperationsTable = lazy(() => import('~/modules/docs/operations/operations-table'));
const SchemasPage = lazy(() => import('~/modules/docs/schemas/schemas-page'));
const PagesTable = lazy(() => import('~/modules/page/table/pages-table'));
const ViewPage = lazy(() => import('~/modules/page/view-page'));
const UpdatePage = lazy(() => import('~/modules/page/update-page'));

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
  getParentRoute: () => PublicLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice boundary="public" error={error} homePath="/docs" />,
  notFoundComponent: () => <ErrorNotice boundary="public" error={new Error('Page not found')} homePath="/docs" />,
  loader: async () => {
    // Prefetch tags, schemas (used for error response deduplication), and pages
    await Promise.all([
      queryClient.ensureQueryData(tagsQueryOptions),
      queryClient.ensureQueryData(schemasQueryOptions),
      queryClient.prefetchInfiniteQuery(pagesListQueryOptions({})),
    ]);
  },
  component: () => (
    <Suspense>
      <DocsLayout />
    </Suspense>
  ),
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
    // Prefetch operations and tags, then prefetch all tag details
    const [, tags] = await Promise.all([
      queryClient.ensureQueryData(operationsQueryOptions),
      queryClient.ensureQueryData(tagsQueryOptions),
    ]);
    await Promise.all(tags.map((tag) => queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name))));
  },
  component: () => (
    <Suspense>
      <OperationsPage />
    </Suspense>
  ),
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
  component: () => (
    <Suspense>
      <OperationsTable />
    </Suspense>
  ),
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
  component: () => (
    <Suspense>
      <OverviewPage />
    </Suspense>
  ),
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
  component: () => (
    <Suspense>
      <SchemasPage />
    </Suspense>
  ),
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
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Pages') }] }),
  getParentRoute: () => DocsLayoutRoute,
  component: () => (
    <Suspense>
      <PagesTable />
    </Suspense>
  ),
});

/**
 * View page route - displays an individual documentation page.
 */
export const DocsPageRoute = createRoute({
  path: '/page/$id',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Page') }] }),
  getParentRoute: () => DocsLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice boundary="public" error={error} homePath="/docs" />,
  notFoundComponent: () => <ErrorNotice boundary="public" error={new Error('Page not found')} homePath="/docs" />,
  component: () => {
    const { id } = useParams({ from: DocsPageRoute.id });
    return (
      <Suspense>
        <ViewPage key={id} pageId={id} />
      </Suspense>
    );
  },
});

/**
 * Edit page route - displays the page edit form.
 */
export const DocsPageEditRoute = createRoute({
  path: '/page/$id/edit',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Edit Page') }] }),
  getParentRoute: () => DocsLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice boundary="public" error={error} homePath="/docs" />,
  notFoundComponent: () => <ErrorNotice boundary="public" error={new Error('Page not found')} homePath="/docs" />,
  component: () => {
    const { id } = useParams({ from: DocsPageEditRoute.id });
    return (
      <Suspense>
        <UpdatePage key={id} pageId={id} />
      </Suspense>
    );
  },
});
