import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { appConfig } from 'shared';
import type { ApiError } from '~/lib/api';
import { productTypeOf } from '~/query/cache-migration';
import { resetConnectivityCache } from '~/query/offline/connectivity';
import { quarantineFailedSync } from '~/query/offline/failed-sync';
import { mutationRetry } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';

// Lazy import breaks the cycle query-client -> on-error -> teardown-user-state -> query-client; a static import makes HMR re-evaluation hit a TDZ error on `onError`.
const handleError = (error: ApiError, meta: QueryMeta | undefined) => import('~/query/on-error').then(({ onError }) => onError(error, meta));
const handleSuccess = () => import('~/query/on-success').then(({ onSuccess }) => onSuccess());

/** What an stx mutation's variables carry, alone or once per item of a batch. */
interface StxVariables {
  stx?: { mutationId?: string; replayed?: boolean };
}

/** stx mutations carry stx.mutationId on the variables (single or batch shape). */
function mutationIdOf(variables: unknown): string | undefined {
  const stxVariables = variables as StxVariables | StxVariables[] | undefined;
  return Array.isArray(stxVariables) ? stxVariables[0]?.stx?.mutationId : stxVariables?.stx?.mutationId;
}

/** Mutation ids restored from the persisted cache and replaying now. Only these quarantine on a 4xx: a live edit's failure reaches the user through the toast and needs no salvage. */
const replayingMutationIds = new Set<string>();

/** Record every paused mutation as replaying; call right before `resumePausedMutations`. */
export function markReplayingMutations(): void {
  for (const mutation of queryClient.getMutationCache().getAll()) {
    if (!mutation.state.isPaused) continue;
    const mutationId = mutationIdOf(mutation.state.variables);
    if (mutationId) replayingMutationIds.add(mutationId);
  }
}

/** Quarantines a replayed mutation that fails with a 4xx so no offline edit is lost after a cache bust. Best-effort. */
function quarantineOnClientError(error: ApiError, variables: unknown, mutationKey: unknown): void {
  const mutationId = mutationIdOf(variables);
  if (!mutationId || !replayingMutationIds.delete(mutationId)) return;

  const status = error?.status;
  if (typeof status !== 'number' || status < 400 || status >= 500) return;

  const entityType = productTypeOf(mutationKey);
  quarantineFailedSync({ mutationId, entityType, clientCacheVersion: appConfig.clientCacheVersion, status, variables, error }).catch(() => {});
}

const mutationCacheConfig = {
  onError: (error: ApiError, variables: unknown, _onMutateResult: unknown, mutation: { meta?: QueryMeta; options?: { mutationKey?: unknown } }) => {
    quarantineOnClientError(error, variables, mutation.options?.mutationKey);
    return handleError(error, mutation.meta);
  },
  onSuccess: (_data: unknown, variables: unknown) => {
    const mutationId = mutationIdOf(variables);
    if (mutationId) replayingMutationIds.delete(mutationId);
    return handleSuccess();
  },
};

const queryCacheConfig = {
  onError: (error: ApiError, query: { meta?: QueryMeta }) => handleError(error, query.meta),
  onSuccess: handleSuccess,
};

const defaultStaleTime = 1000 * 30 * 1; // 30 seconds
const offlineStaleTime = Number.POSITIVE_INFINITY; // Infinite when offline
const defaultGcTime = 1000 * 60 * 60 * 24 * 7; // 7 days

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
 * Flags every mutation that pauses offline, whether it pauses live or is restored paused from the persisted cache: the
 * stx on its variables gets `replayed`, so the request its `mutationFn` sends on resume is arbitrated by intent time.
 * The flag is part of the variables, so it persists with the mutation and no module sets it.
 */
function flagPausedMutations(client: QueryClient): void {
  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'added' && event.type !== 'updated') return;
    if (!event.mutation.state.isPaused) return;
    const variables = event.mutation.state.variables as StxVariables | StxVariables[] | undefined;
    for (const item of Array.isArray(variables) ? variables : [variables]) if (item?.stx) item.stx.replayed = true;
  });
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
        // Connectivity failures reach an offline retry boundary and persist for replay; server errors do not retry, so quarantine and toast handlers run immediately.
        networkMode: 'offlineFirst',
        retry: mutationRetry,
      },
    },
  });

// Subscribed once per page load; the HMR-preserved client keeps its subscription.
if (!import.meta.hot?.data?.listenersAttached) flagPausedMutations(queryClient);

let resolveCacheRestored: () => void;
/**
 * Resolves once PersistQueryClientProvider has restored the IDB cache.
 * @public
 */
export const cacheRestored: Promise<void> =
  (import.meta.hot?.data?.cacheRestored as Promise<void>) ?? new Promise<void>((resolve) => (resolveCacheRestored = resolve));
export function markCacheRestored() {
  resolveCacheRestored();
}

// Preserve queryClient and listener state across HMR
if (import.meta.hot) {
  import.meta.hot.data.queryClient = queryClient;
  import.meta.hot.data.cacheRestored = cacheRestored;
  import.meta.hot.data.listenersAttached = true;
}

/** `true` while offline with offline access on: nothing goes stale, so nothing refetches. `false` restores the default. */
export function setOfflineStaleTime(offline: boolean): void {
  const staleTime = offline ? offlineStaleTime : defaultStaleTime;
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, staleTime } });
  console.debug(`[Query] StaleTime: ${offline ? 'infinite (offline)' : `${defaultStaleTime / 1000}s`}`);
}

/** Called when going from offline to online. */
export function silentRevalidateOnReconnect(): void {
  queryClient.invalidateQueries({ refetchType: 'active' });
  console.debug('[Query] Silent revalidation on reconnect');
}
