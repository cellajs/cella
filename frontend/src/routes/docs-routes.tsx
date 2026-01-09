import { createRoute, useLoaderData, useSearch } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import { tags } from '~/api.gen/docs';
import ErrorNotice from '~/modules/common/error-notice';
import { tagDetailsQueryOptions } from '~/modules/docs/operation-responses';
import { initPagesCollection } from '~/modules/pages/collections';
import { queryClient } from '~/query/query-client';
import { PublicLayoutRoute } from '~/routes/base-routes';
import { docsRouteSearchParamsSchema, pagesRouteSearchParamsSchema } from '~/routes/search-params-schemas';
import appTitle from '~/utils/app-title';

const DocsLayout = lazy(() => import('~/modules/docs/docs-layout'));
const OverviewPage = lazy(() => import('~/modules/docs/overview-page'));
const OperationsByTagList = lazy(() => import('~/modules/docs/operations-by-tag-list'));
const OperationsTable = lazy(() => import('~/modules/docs/operations-table'));
const SchemasList = lazy(() => import('~/modules/docs/schemas-list'));
const PagesTable = lazy(() => import('~/modules/pages/table'));
const PagePage = lazy(() => import('~/modules/pages/page-page'));

/**
 * Documentation route for API reference and developer guides.
 */
export const DocsLayoutRoute = createRoute({
  path: '/docs',
  staticData: { isAuth: false },
  validateSearch: docsRouteSearchParamsSchema,
  head: () => ({ meta: [{ title: appTitle('Docs') }] }),
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
 * Index route - shows operations list or table at /docs based on viewMode
 */
export const DocsIndexRoute = createRoute({
  path: '/',
  staticData: { isAuth: false },
  getParentRoute: () => DocsLayoutRoute,
  loader: async () => {
    // Prefetch all tag details into react-query cache
    await Promise.all(tags.map((tag) => queryClient.prefetchQuery(tagDetailsQueryOptions(tag.name))));
  },
  component: () => {
    const { viewMode = 'list' } = useSearch({ from: '/publicLayout/docs/' });
    return <Suspense>{viewMode === 'table' ? <OperationsTable /> : <OperationsByTagList />}</Suspense>;
  },
});

/**
 * Overview route - shows OpenAPI info in a table format.
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
  getParentRoute: () => DocsLayoutRoute,
  component: () => (
    <Suspense>
      <SchemasList />
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
