import { isSyncStreamLive } from '~/query/realtime/stream-store';

/**
 * Sync-aware staleTime for product entity queries managed by CDC → catchup → sync.
 *
 * Product entities (attachment, page) have their freshness controlled by the
 * catchup pipeline (seq-based invalidation + count-based integrity checks),
 * so time-based staleness is unnecessary when the sync stream is live.
 *
 * Two modes:
 * - **Stream live**: Infinity — catchup handles invalidation on reconnect,
 *   and count integrity checks catch any seq/cache drift. No time-based
 *   refetching needed.
 * - **Stream disconnected** (app start, reconnecting, error): 5 minutes —
 *   fallback so queries refresh on navigation if the stream is down.
 *
 * Previously the global default was 30 seconds, causing all product entity
 * queries to refetch on every app restart regardless of whether catchup
 * detected changes. With Infinity staleTime, persisted caches survive restarts
 * and only refetch when catchup finds actual changes or the integrity check
 * detects count drift.
 *
 * Only apply this to queries covered by the catchup pipeline (product entities
 * like attachment, page). Context entity queries (organization, memberships)
 * and non-synced queries should use the global default staleTime.
 *
 * @example
 * ```typescript
 * return infiniteQueryOptions({
 *   queryKey,
 *   queryFn: ...,
 *   ...baseInfiniteQueryOptions,
 *   staleTime: syncStaleTime,
 * });
 * ```
 */

/** StaleTime for sync-managed queries when stream is live (never stale — catchup + integrity check handle freshness). */
const syncLiveStaleTime = Number.POSITIVE_INFINITY;

/** Fallback staleTime when the sync stream is not live (5 minutes). */
const syncFallbackStaleTime = 5 * 60 * 1000;

/** Dynamic staleTime: Infinity when stream is live, 5 min fallback otherwise. */
export const syncStaleTime = () => (isSyncStreamLive() ? syncLiveStaleTime : syncFallbackStaleTime);
