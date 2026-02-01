import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { onError } from '~/query/on-error';
import { onSuccess } from '~/query/on-success';

const queryClientConfig = { onError, onSuccess };

// Stale time constants
const defaultStaleTime = 1000 * 30 * 1; // 30 seconds
const offlineStaleTime = Number.POSITIVE_INFINITY; // Infinite when offline

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
      staleTime: defaultStaleTime,

      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,

      retry: false,
    },
    mutations: {
      networkMode: 'offlineFirst', // Mutations fire once, then pause if offline and resume when back online
      retry: 0,
    },
  },
});

/**
 * Update staleTime based on offline access mode and network status.
 * When offlineAccess is enabled AND offline, use infinite staleTime.
 * Otherwise use normal staleTime for standard refetch behavior.
 */
export function updateStaleTime(offlineAccess: boolean, isOnline: boolean): void {
  const shouldUseInfiniteStale = offlineAccess && !isOnline;
  const newStaleTime = shouldUseInfiniteStale ? offlineStaleTime : defaultStaleTime;

  queryClient.setDefaultOptions({
    queries: {
      ...queryClient.getDefaultOptions().queries,
      staleTime: newStaleTime,
    },
  });

  console.debug(`[Query] StaleTime: ${shouldUseInfiniteStale ? 'infinite (offline)' : '1min (online)'}`);
}

/**
 * Silently revalidate active queries on reconnect.
 * Called when transitioning from offline to online.
 */
export function silentRevalidateOnReconnect(): void {
  queryClient.invalidateQueries({ refetchType: 'active' });
  console.debug('[Query] Silent revalidation on reconnect');
}
