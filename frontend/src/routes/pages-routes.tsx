import { createRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';
import ErrorNotice from '~/modules/common/error-notice';
import appTitle from '~/utils/app-title';
import { AppLayoutRoute } from './base-routes';

const PagesTable = lazy(() => import('~/modules/pages/table'));

export const PagesRoute = createRoute({
  path: '/pages',
  // validateSearch: attachmentsRouteSearchParamsSchema,
  staticData: { isAuth: true },
  getParentRoute: () => AppLayoutRoute, // OrganizationRoute
  loader: () => {
    // i think this is just a trpc thing
    // await Promise.all([categoriesCollection.preload()])
  },
  // loader: ({ context }) => context,
  // loaderDeps: ({ search: { q, sort, order } }) => ({ q, sort, order }),
  // beforeLoad: async ({ params }) => {
  //   return params;
  // },
  head: (_ctx) => {
    return { meta: [{ title: appTitle('Pages') }] };
  },
  errorComponent: ({ error }) => <ErrorNotice level="app" error={error} />,
  component: () => {
    // const loaderData = useLoaderData({ from: OrganizationRoute.id });

    return (
      <Suspense>
        <PagesTable />
      </Suspense>
    );
  },
});
