import { QueryClient } from '@tanstack/react-query';
import { createRouter } from '@tanstack/react-router';
import { routeMasks, routeTree } from './routeTree';

export const queryClient = new QueryClient();

// Set up a Router instance
const router = createRouter({
  routeTree,
  routeMasks,
  // notFoundRoute,
  defaultPreload: false,
  context: {
    queryClient,
  },
});

// Register the router
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
