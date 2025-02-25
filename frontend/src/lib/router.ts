import { createRouter } from '@tanstack/react-router';
import { queryClient } from '~/query/query-client';
import { routeTree } from '~/routes/route-tree';

/**
 * Our Router instance
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  routeTree,
  // notFoundRoute,
  defaultPreload: false,
  context: { queryClient },
  defaultPendingMinMs: 0,
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  // Required pageTitle in static data
  interface StaticDataRouteOption {
    pageTitle: string | null;
    isAuth: boolean;
  }
}

export default router;
