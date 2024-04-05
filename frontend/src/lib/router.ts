import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeMasks, routeTree } from '~/routes/routeTree';
import { queryClientConfig } from './query-client';

// Set up a QueryClient instance
// https://tanstack.com/query/latest/docs/reference/QueryClient
export const queryClient = new QueryClient({
  mutationCache: new MutationCache(queryClientConfig),
  queryCache: new QueryCache(queryClientConfig),
});

// Set up a Router instance
// https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
const router = createRouter({
  routeTree,
  routeMasks,
  // notFoundRoute,
  defaultPreload: false,
  context: { queryClient },
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }

  // Required pageTitle in static data
  interface StaticDataRouteOption {
    pageTitle: string | null;
  }
}

export default router;
