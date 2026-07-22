import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { appConfig, type ProductEntityType } from 'shared';
import type { ApiError } from '~/lib/api';
import { resetConnectivityCache } from '~/query/offline/connectivity';
import { mutationRetry } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';

const productSet = new Set<string>(appConfig.productEntityTypes);

/** Product entity type encoded in a query/mutation key, or undefined. */
function entityTypeOf(key: unknown): ProductEntityType | undefined {
  const head = Array.isArray(key) ? key[0] : undefined;
  return typeof head === 'string' && productSet.has(head) ? (head as ProductEntityType) : undefined;
}

// Lazy import to break circular dependency: query-client -> on-error -> teardown-user-state -> query-client
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
        // Let connectivity failures reach an offline retry boundary and persist for replay.
        // Server errors do not retry, so their quarantine/toast handlers run immediately.
        networkMode: 'offlineFirst',
        retry: mutationRetry,
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

/** Set staleTime: infinite when offlineAccess is on AND offline (stop refetching), else the normal default. */
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
