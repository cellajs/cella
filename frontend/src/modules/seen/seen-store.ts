// biome-ignore lint/style/noRestrictedImports: imperative call from Zustand action, batched seen-flush not eligible for a React Query hook.
import { markSeen } from 'sdk';
import { appConfig, type ProductEntityType } from 'shared';
import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { isSeenTracked } from '~/modules/seen/helpers';
import { applyUnseenDelta } from '~/modules/seen/unseen-delta';
import { idbKvStorage } from '~/query/idb-kv-storage';

/** Batch of seen entity IDs for one org + entity type (one markSeen call) */
interface SeenBatch {
  tenantId: string;
  organizationId: string;
  productType: ProductEntityType;
  productIds: Set<string>;
}

const FLUSH_INTERVAL_MS = appConfig.mode === 'development' ? 10 * 1000 : 60 * 1000;

/** Cap on persisted flushed IDs, evicting oldest first (Sets iterate in insertion order). Evicted IDs may be re-sent; markSeen skips duplicates. */
const FLUSHED_IDS_MAX = 10_000;

const batchKey = (organizationId: string, productType: ProductEntityType) => `${organizationId}:${productType}`;

// Mutable module state: nothing renders from the queue, and per-mark immutable clones are
// exactly the scroll-time overhead the delta batcher exists to avoid.
const pending = new Map<string, SeenBatch>();
let flushIntervalId: ReturnType<typeof setInterval> | null = null;

interface SeenStoreState {
  /** Entity IDs the server has confirmed as seen (persisted across sessions) */
  flushedIds: Set<string>;

  /** Record an entity as seen and queue it for the next flush. */
  markProductSeen: (
    tenantId: string,
    organizationId: string,
    channelId: string,
    productType: ProductEntityType,
    productId: string,
  ) => void;
  /** Start the periodic flush interval */
  startFlushInterval: () => void;
  /** Stop the periodic flush interval */
  stopFlushInterval: () => void;
  /** Flush all pending seen rows to the server */
  flush: () => Promise<void>;
  /** Reset in-memory state to initial (call on sign-out; persisted data lives in appdb). */
  reset: () => void;
}

/**
 * Store for "seen" entities. Queued from IntersectionObserver, batch-flushed to
 * POST /:tenantId/:organizationId/seen periodically (or on unload via sendBeacon).
 * Pending IDs stay in memory; confirmed IDs persist to prevent resending next session.
 */
export const useSeenStore = create<SeenStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        flushedIds: new Set(),

        markProductSeen: (tenantId, organizationId, channelId, productType, productId) => {
          if (!isSeenTracked(productType)) return;
          if (get().flushedIds.has(productId)) return; // server already told in an earlier session

          const key = batchKey(organizationId, productType);
          const batch = pending.get(key) ?? { tenantId, organizationId, productType, productIds: new Set() };
          if (batch.productIds.has(productId)) return; // session dedup
          batch.productIds.add(productId);
          pending.set(key, batch);

          applyUnseenDelta(channelId, productType, -1);
          if (isDebugMode) console.debug('[SeenStore] queued:', productType, productId.slice(0, 8));
        },

        startFlushInterval: () => {
          if (flushIntervalId) return;
          flushIntervalId = setInterval(() => get().flush(), FLUSH_INTERVAL_MS);
        },

        stopFlushInterval: () => {
          if (flushIntervalId) clearInterval(flushIntervalId);
          flushIntervalId = null;
        },

        flush: async () => {
          if (pending.size === 0) return;
          // Snapshot and clear optimistically; failed batches merge back for the next attempt.
          const batches = [...pending.values()];
          pending.clear();
          if (isDebugMode)
            console.debug(
              '[SeenStore] flushing',
              batches.map((b) => `${b.productType}(${b.productIds.size})`),
            );

          for (const batch of batches) {
            const { tenantId, organizationId, productType } = batch;
            try {
              const productIds = [...batch.productIds];
              await markSeen({
                path: { tenantId, organizationId },
                body: { entityIds: productIds, entityType: productType },
              });

              const flushedIds = new Set(get().flushedIds);
              for (const id of productIds) flushedIds.add(id);
              for (const id of flushedIds) {
                if (flushedIds.size <= FLUSHED_IDS_MAX) break;
                flushedIds.delete(id);
              }
              set({ flushedIds });
            } catch (error) {
              reportCriticalError('seen.flush_failed', error, { productType });
              const requeued = pending.get(batchKey(organizationId, productType));
              if (requeued) for (const id of batch.productIds) requeued.productIds.add(id);
              else pending.set(batchKey(organizationId, productType), batch);
            }
          }
          // No refetch needed: markProductSeen already patched unseen counts, and SSE covers external changes.
        },

        reset: () => {
          pending.clear();
          if (flushIntervalId) clearInterval(flushIntervalId);
          flushIntervalId = null;
          set({ flushedIds: new Set() });
        },
      }),
      {
        name: 'seen',
        skipHydration: true,
        storage: createJSONStorage(() => idbKvStorage('seen')),
        // Sets serialize as arrays; insertion order (oldest first) survives the round-trip.
        partialize: (state) => ({ flushedIds: [...state.flushedIds] }),
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
 * True when this client already saw the entity (flushed to the server, or queued to be).
 * Fork code must use this accessor and keep store internals private.
 */
export function isSeenLocally(entityId: string): boolean {
  if (useSeenStore.getState().flushedIds.has(entityId)) return true;
  for (const batch of pending.values()) if (batch.productIds.has(entityId)) return true;
  return false;
}

/** Flush pending seen data via sendBeacon on page unload. Call once at app init (e.g. root useEffect). */
export const setupSeenBeaconFlush = () => {
  const handler = () => {
    for (const batch of pending.values()) {
      const body = JSON.stringify({ entityIds: [...batch.productIds], entityType: batch.productType });
      navigator.sendBeacon(
        `/api/${batch.tenantId}/${batch.organizationId}/seen`,
        new Blob([body], { type: 'application/json' }),
      );
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
};
