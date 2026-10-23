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

/** The stx mutation id of a mutation's variables; a batch's comes from its first item. */
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

const defaultStaleTime = 30 * 1000;
/** Offline, no query goes stale by age; `Infinity` and not `'static'`, so an invalidated query still refetches. */
const offlineStaleTime = Number.POSITIVE_INFINITY;
const defaultGcTime = 7 * 24 * 60 * 60 * 1000;

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

/** The app's one query client, kept across HMR so the cache survives a module update. */
export const queryClient: QueryClient =
  import.meta.hot?.data?.queryClient ??
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, variables, _onMutateResult, mutation) => {
        quarantineOnClientError(error, variables, mutation.options.mutationKey);
        return handleError(error, mutation.meta);
      },
      onSuccess: (_data, variables) => {
        const mutationId = mutationIdOf(variables);
        if (mutationId) replayingMutationIds.delete(mutationId);
        return handleSuccess();
      },
    }),
    queryCache: new QueryCache({
      onError: (error, query) => handleError(error, query.meta),
      onSuccess: handleSuccess,
    }),
    defaultOptions: {
      queries: {
        networkMode: 'offlineFirst',
        gcTime: defaultGcTime,
        staleTime: defaultStaleTime,

        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,

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
/** Resolves once PersistQueryClientProvider has restored the persisted cache. */
export const cacheRestored: Promise<void> = import.meta.hot?.data?.cacheRestored ?? new Promise<void>((resolve) => (resolveCacheRestored = resolve));
export function markCacheRestored() {
  resolveCacheRestored();
}

if (import.meta.hot) {
  import.meta.hot.data.queryClient = queryClient;
  import.meta.hot.data.cacheRestored = cacheRestored;
  import.meta.hot.data.listenersAttached = true;
}

/** `true` while offline with offline access on; `false` restores the default. */
export function setOfflineStaleTime(offline: boolean): void {
  const staleTime = offline ? offlineStaleTime : defaultStaleTime;
  queryClient.setDefaultOptions({ queries: { ...queryClient.getDefaultOptions().queries, staleTime } });
  console.debug(`[Query] StaleTime: ${offline ? 'infinite (offline)' : `${defaultStaleTime / 1000}s`}`);
}

/** Back online: every query goes stale, and the mounted ones refetch in the background. */
export function silentRevalidateOnReconnect(): void {
  queryClient.invalidateQueries({ refetchType: 'active' });
  console.debug('[Query] Silent revalidation on reconnect');
}
