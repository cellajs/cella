import type { ProductEntityType } from 'shared';
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { markSeen } from '~/api.gen';
import { isDebugMode } from '~/env';

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
  /** Clear all pending data */
  clear: () => void;
}

const FLUSH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/** Build a key for the pending map */
const batchKey = (orgId: string, entityType: string) => `${orgId}:${entityType}`;

/**
 * Store for tracking "seen" entities in the viewport.
 *
 * Entities observed via IntersectionObserver are queued here, then batch-flushed
 * to POST /:tenantId/:orgId/seen every 10 minutes (or on page unload via sendBeacon).
 *
 * No persistence — seen data is transient per session. If the flush fails,
 * pending IDs are retained for the next interval.
 */
export const useSeenStore = create<SeenStoreState>()(
  devtools(
    immer((set, get) => ({
      pending: new Map(),
      flushIntervalId: null,

      markEntitySeen: (tenantId, orgId, entityType, entityId) => {
        set((state) => {
          const key = batchKey(orgId, entityType);
          let batch = state.pending.get(key);
          if (!batch) {
            batch = { tenantId, orgId, entityType, entityIds: new Set() };
            state.pending.set(key, batch);
          }
          batch.entityIds.add(entityId);
        });
      },

      startFlushInterval: () => {
        const existing = get().flushIntervalId;
        if (existing) return; // Already running

        const id = setInterval(() => {
          get().flush();
        }, FLUSH_INTERVAL_MS);

        set((state) => {
          state.flushIntervalId = id;
        });
      },

      stopFlushInterval: () => {
        const id = get().flushIntervalId;
        if (id) {
          clearInterval(id);
          set((state) => {
            state.flushIntervalId = null;
          });
        }
      },

      flush: async () => {
        const { pending } = get();
        if (pending.size === 0) return;

        // Snapshot and clear pending for each batch
        const batches = Array.from(pending.entries()).map(([key, batch]) => ({
          key,
          tenantId: batch.tenantId,
          orgId: batch.orgId,
          entityType: batch.entityType,
          entityIds: Array.from(batch.entityIds),
        }));

        // Clear pending optimistically — failed batches will be re-added
        set((state) => {
          state.pending = new Map();
        });

        for (const batch of batches) {
          if (batch.entityIds.length === 0) continue;

          try {
            await markSeen({
              path: { tenantId: batch.tenantId, orgId: batch.orgId },
              body: { entityIds: batch.entityIds, entityType: batch.entityType },
            });
          } catch {
            // Re-add failed batch IDs for next flush
            set((state) => {
              const key = batchKey(batch.orgId, batch.entityType);
              let existing = state.pending.get(key);
              if (!existing) {
                existing = {
                  tenantId: batch.tenantId,
                  orgId: batch.orgId,
                  entityType: batch.entityType,
                  entityIds: new Set(),
                };
                state.pending.set(key, existing);
              }
              for (const id of batch.entityIds) {
                existing.entityIds.add(id);
              }
            });
          }
        }
      },

      clear: () => {
        const id = get().flushIntervalId;
        if (id) clearInterval(id);
        set((state) => {
          state.pending = new Map();
          state.flushIntervalId = null;
        });
      },
    })),
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
