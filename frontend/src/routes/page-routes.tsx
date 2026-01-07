import { createRoute, useLoaderData, useSearch } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import ErrorNotice from '~/modules/common/error-notice';
import { initPagesCollection } from '~/modules/pages/collections';
import { PublicLayoutRoute } from '~/routes/base-routes';
import { pageRouteSearchParamsSchema } from '~/routes/search-params-schemas';
import appTitle from '~/utils/app-title';

const PagePage = lazy(() => import('~/modules/pages/page-page'));

/**
 * Public page route for viewing individual content pages.
 */
export const PageRoute = createRoute({
  path: '/page/$id',
  staticData: { isAuth: false },
  validateSearch: pageRouteSearchParamsSchema,
  loader: ({ params: { id } }) => {
    const pagesCollection = initPagesCollection();
    return { pageId: id, pagesCollection };
  },

  head: () => ({ meta: [{ title: appTitle('Page') }] }),

  getParentRoute: () => PublicLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  notFoundComponent: () => <ErrorNotice level="app" error={new Error('Page not found')} />,

  component: () => {
    const { pageId, pagesCollection } = useLoaderData({ from: PageRoute.id });
    const { mode } = useSearch({ from: PageRoute.id });
    return (
      <Suspense>
        <PagePage key={pageId} pageId={pageId} pagesCollection={pagesCollection} mode={mode} />
      </Suspense>
    );
  },
});
