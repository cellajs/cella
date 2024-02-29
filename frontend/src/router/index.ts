import { QueryClient } from '@tanstack/react-query';
import { Router } from '@tanstack/react-router';
import { routeMasks, routeTree } from './routeTree';

export const queryClient = new QueryClient();

// Set up a Router instance
const router = new Router({
  routeTree,
  routeMasks,
  // notFoundRoute,
  defaultPreload: 'intent',
  context: {
    queryClient,
  },
});

// Register things for typesafety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

export default router;
