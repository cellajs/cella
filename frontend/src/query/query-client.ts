import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { onError } from '~/query/on-error';
import { onSuccess } from '~/query/on-success';

const queryClientConfig = { onError, onSuccess };

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
 * Our queryClient instance.
 *
 * @link https://tanstack.com/query/latest/docs/reference/QueryClient
 */
export const queryClient = new QueryClient({
  mutationCache: new MutationCache(queryClientConfig),
  queryCache: new QueryCache(queryClientConfig),
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      gcTime: 1000 * 60 * 60 * 24 * 7, // 7 days
      staleTime: 1000 * 60 * 1, // 1 minutes

      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,

      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
