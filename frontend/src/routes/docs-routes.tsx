import { createRoute, useLoaderData } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { tags } from '~/api.gen/docs';
import ErrorNotice from '~/modules/common/error-notice';
import { tagDetailsQueryOptions } from '~/modules/docs/operation-responses';
import { initPagesCollection } from '~/modules/pages/collections';
import { queryClient } from '~/query/query-client';
import { PublicLayoutRoute } from '~/routes/base-routes';
import {
  operationsRouteSearchParamsSchema,
  pagesRouteSearchParamsSchema,
  schemasRouteSearchParamsSchema,
} from '~/routes/search-params-schemas';
import { useDocsStore } from '~/store/docs';
import appTitle from '~/utils/app-title';
import { noDirectAccess } from '~/utils/no-direct-access';
import { stripParams } from '~/utils/strip-search-params';

const DocsLayout = lazy(() => import('~/modules/docs/docs-layout'));
const OverviewPage = lazy(() => import('~/modules/docs/overview-page'));
const OperationsListPage = lazy(() => import('~/modules/docs/operations-list-page'));
const OperationsTable = lazy(() => import('~/modules/docs/operations-table'));
const SchemasListPage = lazy(() => import('~/modules/docs/schemas-list-page'));
const PagesTable = lazy(() => import('~/modules/pages/table'));
const PagePage = lazy(() => import('~/modules/pages/page-page'));

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
  errorComponent: ({ error }) => <ErrorNotice level="public" error={error} homePath="/docs" />,
  notFoundComponent: () => <ErrorNotice level="public" error={new Error('Page not found')} homePath="/docs" />,
  loader: () => {
    const pagesCollection = initPagesCollection();
    return { pagesCollection };
  },
  component: () => (
    <Suspense>
      <DocsLayout />
    </Suspense>
  ),
});

/**
 * Operations route - shows operations list or table view.
 */
export const DocsOperationsRoute = createRoute({
  path: '/operations',
  staticData: { isAuth: false },
  validateSearch: operationsRouteSearchParamsSchema,
  search: {
    middlewares: [stripParams('schemaTag')],
  },
  getParentRoute: () => DocsLayoutRoute,
  loader: async () => {
    // Prefetch all tag details into react-query cache
    await Promise.all(tags.map((tag) => queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name))));
  },
  component: () => {
    const viewMode = useDocsStore((state) => state.viewMode);
    return <Suspense>{viewMode === 'table' ? <OperationsTable /> : <OperationsListPage />}</Suspense>;
  },
});

/**
 * Overview route - shows OpenAPI info in a table format and spec in JSON viewer.
 */
export const DocsOverviewRoute = createRoute({
  path: '/overview',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('API Overview') }] }),
  getParentRoute: () => DocsLayoutRoute,
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
  getParentRoute: () => DocsLayoutRoute,
  component: () => (
    <Suspense>
      <SchemasListPage />
    </Suspense>
  ),
});

/**
 * Pages table route - manages documentation pages.
 */
export const DocsPagesRoute = createRoute({
  path: '/pages',
  validateSearch: pagesRouteSearchParamsSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Pages') }] }),
  getParentRoute: () => DocsLayoutRoute,
  async loader() {
    const pagesCollection = initPagesCollection();
    return { pagesCollection };
  },
  component: () => (
    <Suspense>
      <PagesTable />
    </Suspense>
  ),
});

/**
 * Single page route - displays an individual documentation page.
 */
export const DocsPageRoute = createRoute({
  path: '/page/$id/$mode',
  staticData: { isAuth: false },
  loader: ({ params: { id } }) => {
    const pagesCollection = initPagesCollection();
    return { pageId: id, pagesCollection };
  },
  head: () => ({ meta: [{ title: appTitle('Page') }] }),
  getParentRoute: () => DocsLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="public" error={error} homePath="/docs" />,
  notFoundComponent: () => <ErrorNotice level="public" error={new Error('Page not found')} homePath="/docs" />,
  component: () => {
    const { pageId, pagesCollection } = useLoaderData({ from: DocsPageRoute.id });
    const { mode } = DocsPageRoute.useParams();
    const resolvedMode = mode === 'edit' ? 'edit' : 'view';
    return (
      <Suspense>
        <PagePage key={pageId} pageId={pageId} pagesCollection={pagesCollection} mode={resolvedMode} />
      </Suspense>
    );
  },
});
