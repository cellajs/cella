import { createRouter } from '@tanstack/react-router';
import { routeTree } from '~/routes/route-tree';

/**
 * Our Router instance
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'instant',
  defaultHashScrollIntoView: { behavior: 'smooth' },
  routeTree,
  // notFoundRoute,
  defaultPreload: false,
  context: {},
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
