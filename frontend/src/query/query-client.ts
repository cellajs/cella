import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { resetConnectivityCache } from '~/query/offline/connectivity';
import type { QueryMeta } from '~/query/react-query';

const productEntitySet = new Set<string>(appConfig.productEntityTypes);

/** Product entity type encoded in a query/mutation key, or undefined. */
function entityTypeOf(key: unknown): string | undefined {
  const head = Array.isArray(key) ? key[0] : undefined;
  return typeof head === 'string' && productEntitySet.has(head) ? head : undefined;
}

// Lazy import to break circular dependency: query-client -> on-error -> flush-stores -> query-client
// Without this, HMR re-evaluation hits a TDZ error on `onError`.
const handleError = (error: ApiError, meta: QueryMeta | undefined) =>
  import('~/query/on-error').then((m) => m.onError(error, meta));
const handleSuccess = () => import('~/query/on-success').then((m) => m.onSuccess());

/**
 * Quarantine a mutation that fails replay with a 4xx so no offline edit is lost
 * after a cache bust. Best-effort, lazy-imported to avoid cycles.
 */
function quarantineOnClientError(error: ApiError, vars: unknown, mutationKey: unknown): void {
  const status = error?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) return;

  // stx mutations carry stx.mutationId on the variables (single or batch shape).
  const variables = vars as { stx?: { mutationId?: string } } | Array<{ stx?: { mutationId?: string } }> | undefined;
  const mutationId = Array.isArray(variables) ? variables[0]?.stx?.mutationId : variables?.stx?.mutationId;
  if (!mutationId) return;

  const entityType = entityTypeOf(mutationKey);
  import('~/query/offline/failed-sync')
    .then(({ quarantineFailedSync }) =>
      quarantineFailedSync({
        mutationId,
        entityType,
        clientCacheVersion: appConfig.clientCacheVersion,
        status,
        variables: vars,
        error,
      }),
    )
    .catch(() => {});
}

const mutationCacheConfig = {
  onError: (
    error: ApiError,
    vars: unknown,
    _ctx: unknown,
    mutation: { meta?: QueryMeta; options?: { mutationKey?: unknown } },
  ) => {
    quarantineOnClientError(error, vars, mutation.options?.mutationKey);
    return handleError(error, mutation.meta);
  },
  onSuccess: handleSuccess,
};

const queryCacheConfig = {
  onError: (error: ApiError, query: { meta?: QueryMeta }) => handleError(error, query.meta),
  onSuccess: handleSuccess,
};

// Stale time constants
const defaultStaleTime = 1000 * 30 * 1; // 30 seconds
const offlineStaleTime = Number.POSITIVE_INFINITY; // Infinite when offline
const defaultGcTime = 1000 * 60 * 60 * 24 * 7; // 7 days

/**
 * Handle online status, guarded to avoid duplicate listeners on HMR.
 */
function handleOnlineStatus() {
  onlineManager.setOnline(navigator.onLine);
  if (navigator.onLine) resetConnectivityCache();
}

if (!import.meta.hot?.data?.listenersAttached) {
  window.addEventListener('online', handleOnlineStatus);
  window.addEventListener('offline', handleOnlineStatus);
  handleOnlineStatus();
}

/**
 * QueryClient instance preserved across HMR to keep the cache intact.
 *
 * @link https://tanstack.com/query/latest/docs/reference/QueryClient
 */
export const queryClient: QueryClient =
  (import.meta.hot?.data?.queryClient as QueryClient) ??
  new QueryClient({
    mutationCache: new MutationCache(mutationCacheConfig),
    queryCache: new QueryCache(queryCacheConfig),
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        gcTime: defaultGcTime,
        staleTime: defaultStaleTime,

        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true, // Automatically refetch when coming back online

        retry: false,
      },
      mutations: {
        networkMode: 'offlineFirst', // Mutations fire once, then pause if offline and resume when back online
        retry: 0,
      },
    },
  });

/** Promise that resolves once the PersistQueryClientProvider has restored the IDB cache. */
let resolveCacheRestored: () => void;
export const cacheRestored: Promise<void> =
  (import.meta.hot?.data?.cacheRestored as Promise<void>) ?? new Promise<void>((r) => (resolveCacheRestored = r));
export function markCacheRestored() {
  resolveCacheRestored();
}

// Preserve queryClient and listener state across HMR
if (import.meta.hot) {
  import.meta.hot.data.queryClient = queryClient;
  import.meta.hot.data.cacheRestored = cacheRestored;
  import.meta.hot.data.listenersAttached = true;
}

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

  console.debug(`[Query] StaleTime: ${shouldUseInfiniteStale ? 'infinite (offline)' : '30s (online)'}`);
}

/**
 * Silently revalidate active queries on reconnect.
 * Called when transitioning from offline to online.
 */
export function silentRevalidateOnReconnect(): void {
  queryClient.invalidateQueries({ refetchType: 'active' });
  console.debug('[Query] Silent revalidation on reconnect');
}
