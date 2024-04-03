import { createRouter } from '@tanstack/react-router';
import { routeMasks, routeTree } from '~/routes/routeTree';
import { queryClient } from './query-client';

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
}

export default router;
