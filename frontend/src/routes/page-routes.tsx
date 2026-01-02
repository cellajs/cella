import { onlineManager } from '@tanstack/react-query';
import { createRoute, notFound, useLoaderData, useSearch } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

import ErrorNotice from '~/modules/common/error-notice';
import { pageQueryOptions } from '~/modules/pages/query';
import { queryClient } from '~/query/query-client';
import { PublicLayoutRoute } from '~/routes/base-routes';
import { pageRouteSearchParamsSchema } from '~/routes/search-params-schemas';
import appTitle from '~/utils/app-title';

const PagePage = lazy(() => import('~/modules/pages/page-page'));

export const PageRoute = createRoute({
  path: '/page/$id',
  staticData: { isAuth: false },
  validateSearch: pageRouteSearchParamsSchema,
  loader: async ({ params: { id } }) => {
    const opts = pageQueryOptions(id);

    const page = onlineManager.isOnline()
      ? await queryClient.ensureQueryData({ ...opts, revalidateIfStale: true })
      : queryClient.getQueryData(opts.queryKey);

    if (!page) throw notFound(); // 404
    return page;
  },

  head: (ctx) => {
    const page = ctx.match.loaderData;
    return { meta: [{ title: appTitle(page?.name ?? 'Page') }] };
  },

  getParentRoute: () => PublicLayoutRoute,
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  notFoundComponent: () => <ErrorNotice level="app" error={new Error('Page not found')} />,

  component: () => {
    const page = useLoaderData({ from: PageRoute.id });
    const { mode } = useSearch({ from: PageRoute.id });
    return (
      <Suspense>
        <PagePage key={page.id} pageId={page.id} mode={mode} />
      </Suspense>
    );
  },
});
