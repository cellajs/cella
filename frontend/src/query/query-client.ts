import { MutationCache, onlineManager, QueryCache, QueryClient } from '@tanstack/react-query';
import { isRecord } from 'shared/utils/as-record';
import type { ApiError } from '~/lib/api';
import { productTypeOf } from '~/query/cache-migration';
import { mutationRetry, replayRetry } from '~/query/offline/network-retry';
import type { QueryMeta } from '~/query/react-query';

// Lazy import breaks the cycle query-client -> on-error -> teardown-user-state -> query-client; a static import makes HMR re-evaluation hit a TDZ error on `onError`.
const handleError = (error: ApiError, meta: QueryMeta | undefined) => import('~/query/on-error').then(({ onError }) => onError(error, meta));

/** How long a query counts as fresh while online. */
export const defaultStaleTime = 30 * 1000;
/** Offline, no query goes stale by age; `Infinity` and not `'static'`, so an invalidated query still refetches. */
const offlineStaleTime = Number.POSITIVE_INFINITY;
const defaultGcTime = 7 * 24 * 60 * 60 * 1000;

/** Sets `replayed` on the stx of a mutation's variables. */
function flagReplay(variables: unknown): void {
  if (isRecord(variables) && isRecord(variables.stx)) variables.stx.replayed = true;
}

/**
 * Flags a mutation as a replay when it pauses offline or is restored paused from the persisted cache, and, through
 * `applyOnlineState`, when the device goes offline while it waits: the request its `mutationFn` sends on resume is
 * arbitrated by intent time and retried through a gateway's outage. A live edit that waits online behind another of
 * its scope stays unflagged, so the server orders it by arrival. The flag is part of the variables, so it persists
 * with the mutation and no module sets it.
 */
function flagReplays(client: QueryClient): void {
  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'added' && event.type !== 'updated') return;
    if (event.mutation.state.isPaused && (event.type === 'added' || !onlineManager.isOnline())) flagReplay(event.mutation.state.variables);
  });
}

/** Gives each mutation on the default retry one that reads its variables: a sync write outlasts a lost answer, a replay a gateway's outage. */
function retryReplays(client: QueryClient): void {
  client.getMutationCache().subscribe((event) => {
    if (event.type !== 'added' || event.mutation.options.retry !== mutationRetry) return;
    const { mutation } = event;
    mutation.setOptions({ ...mutation.options, retry: replayRetry(() => mutation.state.variables) });
  });
}

/** The app's one query client, kept across HMR so the cache survives a module update. */
export const queryClient: QueryClient =
  import.meta.hot?.data?.queryClient ??
  new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _onMutateResult, mutation) => handleError(error, mutation.meta),
    }),
    queryCache: new QueryCache({
      onError: (error, query) => handleError(error, query.meta),
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
        // Connectivity failures reach an offline retry boundary and persist for replay; server errors do not retry, so the toast and rollback run at once.
        networkMode: 'offlineFirst',
        retry: mutationRetry,
      },
    },
  });

/**
 * Offline, no query goes stale by age, and every mutation waiting to run becomes a replay. Back online, every query but
 * the synced product ones is marked and the mounted ones refetch in the background: a product list is the sync engine's,
 * whose catchup fetches what a dropped stream missed.
 */
function applyOnlineState(online: boolean): void {
  console.info(`[Offline] Network: ${online ? 'online' : 'offline'}`);
  const staleTime = online ? defaultStaleTime : offlineStaleTime;
  // setDefaultOptions replaces every default: the mutation defaults carry the offline retry and pause.
  const defaults = queryClient.getDefaultOptions();
  queryClient.setDefaultOptions({ ...defaults, queries: { ...defaults.queries, staleTime } });
  if (online) {
    queryClient.invalidateQueries({ refetchType: 'active', predicate: ({ queryKey }) => !productTypeOf(queryKey) });
    return;
  }
  for (const { state } of queryClient.getMutationCache().getAll()) if (state.isPaused) flagReplay(state.variables);
}

// Subscribed once per page load; the HMR-preserved client keeps its subscription.
if (!import.meta.hot?.data?.listenersAttached) {
  flagReplays(queryClient);
  retryReplays(queryClient);
  onlineManager.subscribe(applyOnlineState);
  // The onlineManager starts online, then follows the browser's online and offline events: seed it with what the browser reports now.
  onlineManager.setOnline(navigator.onLine);
}

let resolveCacheRestored: () => void;
/** Resolves once PersistQueryClientProvider's restore at boot finished or failed. */
export const cacheRestored: Promise<void> = import.meta.hot?.data?.cacheRestored ?? new Promise<void>((resolve) => (resolveCacheRestored = resolve));
export function markCacheRestored() {
  resolveCacheRestored();
}

if (import.meta.hot) {
  import.meta.hot.data.queryClient = queryClient;
  import.meta.hot.data.cacheRestored = cacheRestored;
  import.meta.hot.data.listenersAttached = true;
}
