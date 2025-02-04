import { MutationCache, QueryCache, QueryClient, onlineManager } from '@tanstack/react-query';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { createRouter } from '@tanstack/react-router';
import { del, get, set } from 'idb-keyval';
import { queryClientConfig } from '~/lib/query-client';
import { routeTree } from '~/routes';

/**
 * Handle online status
 */
function handleOnlineStatus() {
  onlineManager.setOnline(navigator.onLine);
}

window.addEventListener('online', handleOnlineStatus);
window.addEventListener('offline', handleOnlineStatus);

handleOnlineStatus();

/**
 * Our queryClient instance
 *
 * @link https://tanstack.com/query/latest/docs/reference/QueryClient
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache(queryClientConfig),
  queryCache: new QueryCache(queryClientConfig),
  defaultOptions: {
    queries: {
      // networkMode: 'offlineFirst',
      gcTime: 1000 * 60 * 60 * 24, // 24 hours
      staleTime: 1000 * 60 * 5, // 5 minutes

      refetchOnWindowFocus: true, // Refetch on window focus
      refetchOnReconnect: true,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

/**
 * Create an IndexedDB persister for react-query
 */
function createIDBPersister(idbValidKey: IDBValidKey = 'reactQuery') {
  return {
    persistClient: async (client: PersistedClient) => {
      await set(idbValidKey, client);
    },
    restoreClient: async () => {
      return await get<PersistedClient>(idbValidKey);
    },
    removeClient: async () => {
      await del(idbValidKey);
    },
  } as Persister;
}

export const persister = createIDBPersister();

/**
 * Our Router instance
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/createRouterFunction
 */
const router = createRouter({
  scrollRestoration: true,
  scrollRestorationBehavior: 'smooth',
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
