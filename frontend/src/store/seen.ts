import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import type { GetUnseenCountsResponse } from '~/api.gen';
import { markSeen } from '~/api.gen';
import { isDebugMode } from '~/env';
import { queryClient } from '~/query/query-client';

/** Batch of seen entity IDs grouped by org and entity type */
interface SeenBatch {
  tenantId: string;
  orgId: string;
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

  /** Record an entity as seen — queued for next flush */
  markEntitySeen: (tenantId: string, orgId: string, entityType: ProductEntityType, entityId: string) => void;
  /** Start the periodic flush interval (10 minutes) */
  startFlushInterval: () => void;
  /** Stop the periodic flush interval */
  stopFlushInterval: () => void;
  /** Flush all pending seen records to the server */
  flush: () => Promise<void>;
  /** Clear all pending + persisted data (call on sign-out) */
  clear: () => void;
}

const FLUSH_INTERVAL_MS = appConfig.mode === 'development' ? 10 * 1000 : 60 * 1000; // 10s in dev, 1min in prod

/** Build a key for the pending map */
const batchKey = (orgId: string, entityType: string) => `${orgId}:${entityType}`;

/**
 * Store for tracking "seen" entities in the viewport.
 *
 * Entities observed via IntersectionObserver are queued here, then batch-flushed
 * to POST /:tenantId/:orgId/seen periodically (or on page unload via sendBeacon).
 *
 * Successfully flushed IDs are kept in `flushedIds` and persisted to localStorage
 * via Zustand's persist middleware, so they are not re-sent on subsequent sessions.
 * If a flush fails, pending IDs are retained for the next interval.
 */
export const useSeenStore = create<SeenStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        pending: new Map(),
        flushedIds: new Set(),
        flushIntervalId: null,

        markEntitySeen: (tenantId, orgId, entityType, entityId) => {
          // Skip if already flushed to server in a previous session
          if (get().flushedIds.has(entityId)) return;

          const pending = get().pending;
          const key = batchKey(orgId, entityType);
          const existing = pending.get(key);
          const entityIds = existing?.entityIds ?? new Set<string>();

          // Dedup — already queued this session
          if (entityIds.has(entityId)) return;

          const newSet = new Set(entityIds);
          newSet.add(entityId);

          const newMap = new Map(pending);
          newMap.set(key, { tenantId, orgId, entityType, entityIds: newSet });
          set({ pending: newMap });

          // Optimistically decrement unseen count in query cache for instant badge update
          queryClient.setQueryData<GetUnseenCountsResponse>(['me', 'unseen', 'counts'], (old) => {
            if (!old) return old;
            const current = old[orgId]?.[entityType];
            if (!current) return old;

            const updated = { ...old, [orgId]: { ...old[orgId], [entityType]: current - 1 } };
            // Remove zero entries
            if (updated[orgId][entityType] <= 0) {
              const { [entityType]: _, ...rest } = updated[orgId];
              if (Object.keys(rest).length === 0) {
                const { [orgId]: __, ...withoutOrg } = updated;
                return withoutOrg;
              }
              updated[orgId] = rest;
            }
            return updated;
          });

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
            orgId: batch.orgId,
            entityType: batch.entityType,
            entityIds: Array.from(batch.entityIds),
          }));

          console.debug(
            '[SeenStore] flushing',
            batches.map((b) => `${b.entityType}:${b.orgId.slice(0, 8)}(${b.entityIds.length})`),
          );

          // Clear pending optimistically — failed batches will be re-added
          set({ pending: new Map() });

          let hasSuccessfulFlush = false;

          for (const batch of batches) {
            if (batch.entityIds.length === 0) continue;

            try {
              const result = await markSeen({
                path: { tenantId: batch.tenantId, orgId: batch.orgId },
                body: { entityIds: batch.entityIds, entityType: batch.entityType },
              });
              // Track flushed IDs so next session skips them
              const newFlushed = new Set(get().flushedIds);
              for (const id of batch.entityIds) newFlushed.add(id);
              set({ flushedIds: newFlushed });

              console.debug(
                '[SeenStore] flush OK:',
                batch.entityType,
                batch.orgId.slice(0, 8),
                'newCount:',
                result.newCount,
              );
              hasSuccessfulFlush = true;
            } catch (error) {
              console.error('[SeenStore] flush failed:', batch.entityType, batch.orgId.slice(0, 8), error);
              // Re-add failed batch IDs for next flush
              const current = get().pending;
              const key = batchKey(batch.orgId, batch.entityType);
              const prev = current.get(key);
              const merged = new Set(prev?.entityIds ?? []);
              for (const id of batch.entityIds) merged.add(id);

              const newMap = new Map(current);
              newMap.set(key, {
                tenantId: batch.tenantId,
                orgId: batch.orgId,
                entityType: batch.entityType,
                entityIds: merged,
              });
              set({ pending: newMap });
            }
          }

          // Refresh unseen counts and entity lists after successful flush
          if (hasSuccessfulFlush) {
            queryClient.invalidateQueries({ queryKey: ['me', 'unseen', 'counts'] });
            // Refetch entity lists to update viewCount
            for (const batch of batches) {
              queryClient.invalidateQueries({ queryKey: [batch.entityType, 'list'] });
            }
          }
        },

        clear: () => {
          const id = get().flushIntervalId;
          if (id) clearInterval(id);
          set({ pending: new Map(), flushedIds: new Set(), flushIntervalId: null });
        },
      }),
      {
        name: `${appConfig.slug}-seen`,
        storage: createJSONStorage(() => localStorage),
        // Only persist flushedIds — store as array for JSON compatibility
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

/**
 * Flush pending seen data via sendBeacon on page unload.
 * Uses sendBeacon for reliability when the page is being closed.
 *
 * Call this once at app init (e.g., in a useEffect in the root component).
 */
export const setupSeenBeaconFlush = () => {
  const handler = () => {
    const { pending } = useSeenStore.getState();
    if (pending.size === 0) return;

    for (const [, batch] of pending) {
      const entityIds = Array.from(batch.entityIds);
      if (entityIds.length === 0) continue;

      const url = `/api/${batch.tenantId}/${batch.orgId}/seen`;
      const body = JSON.stringify({ entityIds, entityType: batch.entityType });

      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
    }
  };

  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
};
