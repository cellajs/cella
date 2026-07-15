import type { GetUnseenCountsResponse } from 'sdk';
// biome-ignore lint/style/noRestrictedImports: imperative call from Zustand action, batched seen-flush not eligible for a React Query hook.
import { markSeen } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { idbKvStorage } from '~/query/idb-kv-storage';
import { queryClient } from '~/query/query-client';

/** Batch of seen entity IDs grouped by org and entity type */
interface SeenBatch {
  tenantId: string;
  organizationId: string;
  /** Channel entity ID for badge grouping (e.g., projectId). Defaults to organizationId. */
  channelId: string;
  entityType: ProductEntityType;
  entityIds: Set<string>;
}

interface SeenStoreState {
  /** Pending seen IDs per org+entityType key */
  pending: Map<string, SeenBatch>;
  /** Entity IDs successfully flushed to the server (persisted across sessions) */
  flushedIds: Set<string>;
  /** Interval ID for periodic flush */
  flushIntervalId: ReturnType<typeof setInterval> | null;

  /** Record an entity as seen and queue it for the next flush. */
  markEntitySeen: (
    tenantId: string,
    organizationId: string,
    channelId: string,
    entityType: ProductEntityType,
    entityId: string,
  ) => void;
  /** Start the periodic flush interval (10 minutes) */
  startFlushInterval: () => void;
  /** Stop the periodic flush interval */
  stopFlushInterval: () => void;
  /** Flush all pending seen rows to the server */
  flush: () => Promise<void>;
  /** Reset in-memory state to initial (call on sign-out; persisted data lives in appdb). */
  reset: () => void;
}

const FLUSH_INTERVAL_MS = appConfig.mode === 'development' ? 10 * 1000 : 60 * 1000; // 10s in dev, 1min in prod

/** Build a key for the pending map */
const batchKey = (organizationId: string, entityType: string) => `${organizationId}:${entityType}`;

/**
 * Batched unseen-count optimistic update.
 *
 * During scroll, many SeenMark IntersectionObserver callbacks fire per frame.
 * Each `queryClient.setQueryData` triggers a React Query cache `updated` event,
 * which causes PersistQueryClientProvider to synchronously call `dehydrate(queryClient)`
 * over the entire cache. With offline access and hundreds of cached queries, this
 * creates significant main-thread jank.
 *
 * Decrements are accumulated and applied in a single `setQueryData` call via
 * microtask, so one scroll batch produces at most one cache event.
 */
const pendingDecrements: { channelId: string; entityType: string }[] = [];
let decrementScheduled = false;

/** Max delay before forcing a flush even if the browser never goes idle */
const UNSEEN_DECREMENT_MAX_DELAY_MS = 5000;

const scheduleIdleCallback =
  typeof requestIdleCallback === 'function'
    ? (cb: () => void) => requestIdleCallback(cb, { timeout: UNSEEN_DECREMENT_MAX_DELAY_MS })
    : (cb: () => void) => setTimeout(cb, 1000);

function scheduleUnseenDecrement(channelId: string, entityType: string) {
  pendingDecrements.push({ channelId, entityType });

  if (!decrementScheduled) {
    decrementScheduled = true;
    scheduleIdleCallback(flushUnseenDecrements);
  }
}

function flushUnseenDecrements() {
  decrementScheduled = false;
  if (pendingDecrements.length === 0) return;

  const batch = pendingDecrements.splice(0);

  queryClient.setQueryData<GetUnseenCountsResponse>(['me', 'unseen', 'counts'], (old) => {
    if (!old) return old;
    const updated = { ...old };

    for (const { channelId, entityType } of batch) {
      const current = updated[channelId]?.[entityType];
      if (!current) continue;

      if (current <= 1) {
        const { [entityType]: _, ...rest } = updated[channelId];
        updated[channelId] = rest;
      } else {
        updated[channelId] = { ...updated[channelId], [entityType]: current - 1 };
      }
    }

    // Remove empty context entries
    for (const key of Object.keys(updated)) {
      if (Object.keys(updated[key]).length === 0) delete updated[key];
    }

    return updated;
  });
}

/**
 * Store for "seen" entities. Queued from IntersectionObserver, then batch-flushed to
 * POST /:tenantId/:organizationId/seen periodically (or on unload via sendBeacon). Flushed IDs
 * persist to localStorage (Zustand persist) so they aren't re-sent next session; failed flushes are retained.
 */
export const useSeenStore = create<SeenStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        pending: new Map(),
        flushedIds: new Set(),
        flushIntervalId: null,

        markEntitySeen: (tenantId, organizationId, channelId, entityType, entityId) => {
          // Skip entity types not configured for seen tracking
          if (!(appConfig.seenTrackedEntityTypes as readonly string[]).includes(entityType)) return;

          // Persisted flush state means the server has already seen this entity.
          if (get().flushedIds.has(entityId)) return;

          const pending = get().pending;
          const key = batchKey(organizationId, entityType);
          const existing = pending.get(key);
          const entityIds = existing?.entityIds ?? new Set<string>();

          // Dedup within the current session.
          if (entityIds.has(entityId)) return;

          const newSet = new Set(entityIds);
          newSet.add(entityId);

          const newMap = new Map(pending);
          newMap.set(key, { tenantId, organizationId, channelId, entityType, entityIds: newSet });
          set({ pending: newMap });

          // Batch optimistic unseen count decrement, applied via microtask to
          // avoid per-entity cache events during rapid scroll
          scheduleUnseenDecrement(channelId, entityType);

          const total = Array.from(get().pending.values()).reduce((sum, b) => sum + b.entityIds.size, 0);
          console.debug('[SeenStore] queued:', entityType, entityId.slice(0, 8), `(${total} pending)`);
        },

        startFlushInterval: () => {
          const existing = get().flushIntervalId;
          if (existing) return;

          const id = setInterval(() => {
            get().flush();
          }, FLUSH_INTERVAL_MS);

          set({ flushIntervalId: id });
        },

        stopFlushInterval: () => {
          const id = get().flushIntervalId;
          if (id) {
            clearInterval(id);
            set({ flushIntervalId: null });
          }
        },

        flush: async () => {
          const { pending } = get();
          if (pending.size === 0) return;

          // Snapshot and clear pending
          const batches = Array.from(pending.entries()).map(([key, batch]) => ({
            key,
            tenantId: batch.tenantId,
            organizationId: batch.organizationId,
            channelId: batch.channelId,
            entityType: batch.entityType,
            entityIds: Array.from(batch.entityIds),
          }));

          console.debug(
            '[SeenStore] flushing',
            batches.map((b) => `${b.entityType}:${b.organizationId.slice(0, 8)}(${b.entityIds.length})`),
          );

          // Clear pending optimistically, failed batches are re-added.
          set({ pending: new Map() });

          for (const batch of batches) {
            if (batch.entityIds.length === 0) continue;

            try {
              const result = await markSeen({
                path: { tenantId: batch.tenantId, organizationId: batch.organizationId },
                body: { entityIds: batch.entityIds, entityType: batch.entityType },
              });
              // Track flushed IDs so next session skips them
              const newFlushed = new Set(get().flushedIds);
              for (const id of batch.entityIds) newFlushed.add(id);
              set({ flushedIds: newFlushed });

              console.debug(
                '[SeenStore] flush OK:',
                batch.entityType,
                batch.organizationId.slice(0, 8),
                'newCount:',
                result.newCount,
              );
            } catch (error) {
              console.error('[SeenStore] flush failed:', batch.entityType, batch.organizationId.slice(0, 8), error);
              reportCriticalError('seen.flush_failed', error, { entityType: batch.entityType });
              // Re-add failed batch IDs for next flush
              const current = get().pending;
              const key = batchKey(batch.organizationId, batch.entityType);
              const prev = current.get(key);
              const merged = new Set(prev?.entityIds ?? []);
              for (const id of batch.entityIds) merged.add(id);

              const newMap = new Map(current);
              newMap.set(key, {
                tenantId: batch.tenantId,
                organizationId: batch.organizationId,
                channelId: batch.channelId,
                entityType: batch.entityType,
                entityIds: merged,
              });
              set({ pending: newMap });
            }
          }

          // No refetch needed: markEntitySeen patches unseen counts, and SSE handles external changes.
        },

        reset: () => {
          // Fresh Map/Set instances (can't share a const) + stop the periodic flush.
          const id = get().flushIntervalId;
          if (id) clearInterval(id);
          set({ pending: new Map(), flushedIds: new Set(), flushIntervalId: null });
        },
      }),
      {
        name: 'seen',
        skipHydration: true,
        storage: createJSONStorage(() => idbKvStorage('seen')),
        // Store flushedIds as an array for JSON compatibility.
        partialize: (state) => ({ flushedIds: [...state.flushedIds] }),
        // Rehydrate array back to Set
        merge: (persisted, current) => ({
          ...current,
          flushedIds: new Set((persisted as { flushedIds?: string[] })?.flushedIds ?? []),
        }),
      },
    ),
    { enabled: isDebugMode, name: 'seen store' },
  ),
);

/** Flush pending seen data via sendBeacon on page unload. Call once at app init (e.g. root useEffect). */
export const setupSeenBeaconFlush = () => {
  const handler = () => {
    const { pending } = useSeenStore.getState();
    if (pending.size === 0) return;

    for (const [, batch] of pending) {
      const entityIds = Array.from(batch.entityIds);
      if (entityIds.length === 0) continue;

      const url = `/api/${batch.tenantId}/${batch.organizationId}/seen`;
      const body = JSON.stringify({ entityIds, entityType: batch.entityType });

      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    }
  };

  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
};
