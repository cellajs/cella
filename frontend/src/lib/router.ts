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
  defaultPreload: false,
  context: {},
  defaultPendingMinMs: 0,
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  // Required props in staticData
  interface StaticDataRouteOption {
    isAuth: boolean;
    /** Entity type for this route (used for context and organization-scoped routes) */
    entityType?: 'organization';
    /** Tab metadata for PageNav - if defined, this route will appear as a nav tab */
    navTab?: {
      id: string;
      label: string;
    };
  }
}

export default router;
