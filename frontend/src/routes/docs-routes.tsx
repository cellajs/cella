import { createRoute, useLoaderData, useSearch } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import { initPagesCollection } from '~/modules/pages/collections';
import { PublicLayoutRoute } from '~/routes/base-routes';
import {
  docsRouteSearchParamsSchema,
  pageRouteSearchParamsSchema,
  pagesRouteSearchParamsSchema,
} from '~/routes/search-params-schemas';
import appTitle from '~/utils/app-title';

const DocsPage = lazy(() => import('~/modules/docs/docs-page'));
const OverviewTable = lazy(() => import('~/modules/docs/overview-table'));
const OperationsView = lazy(() => import('~/modules/docs/operations-view'));
const SchemasList = lazy(() => import('~/modules/docs/schemas-list'));
const PagesTable = lazy(() => import('~/modules/pages/table'));
const PagePage = lazy(() => import('~/modules/pages/page-page'));

/**
 * Documentation route for API reference and developer guides.
 */
export const DocsRoute = createRoute({
  path: '/docs',
  staticData: { isAuth: false },
  validateSearch: docsRouteSearchParamsSchema,
  head: () => ({ meta: [{ title: appTitle('Docs') }] }),
  getParentRoute: () => PublicLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => (
    <Suspense>
      <DocsPage />
    </Suspense>
  ),
});

/**
 * Index route - shows operations list or table at /docs based on viewMode
 */
export const DocsIndexRoute = createRoute({
  path: '/',
  staticData: { isAuth: false },
  getParentRoute: () => DocsRoute,
  component: () => (
    <Suspense>
      <OperationsView />
    </Suspense>
  ),
});

/**
 * Overview route - shows OpenAPI info in a table format.
 */
export const DocsOverviewRoute = createRoute({
  path: '/overview',
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('API Overview') }] }),
  getParentRoute: () => DocsRoute,
  component: () => (
    <Suspense>
      <OverviewTable />
    </Suspense>
  ),
});

/**
 * Schemas list route - displays all API schemas.
 */
export const DocsSchemasRoute = createRoute({
  path: '/schemas',
  staticData: { isAuth: false },
  getParentRoute: () => DocsRoute,
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
  getParentRoute: () => DocsRoute,
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
  path: '/page/$id',
  staticData: { isAuth: false },
  validateSearch: pageRouteSearchParamsSchema,
  loader: ({ params: { id } }) => {
    const pagesCollection = initPagesCollection();
    return { pageId: id, pagesCollection };
  },
  head: () => ({ meta: [{ title: appTitle('Page') }] }),
  getParentRoute: () => DocsRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  notFoundComponent: () => <ErrorNotice level="app" error={new Error('Page not found')} />,
  component: () => {
    const { pageId, pagesCollection } = useLoaderData({ from: DocsPageRoute.id });
    const { mode } = useSearch({ from: DocsPageRoute.id });
    return (
      <Suspense>
        <PagePage key={pageId} pageId={pageId} pagesCollection={pagesCollection} mode={mode} />
      </Suspense>
    );
  },
});
