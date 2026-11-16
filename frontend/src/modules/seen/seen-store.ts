// biome-ignore lint/style/noRestrictedImports: imperative call from Zustand action, batched seen-flush not eligible for a React Query hook.
import { markSeen } from 'sdk';
import { appConfig, isSeenTracked, type ProductEntityType, type SeenTrackedProductType, seenBatchMax } from 'shared';
import { isRecord } from 'shared/utils/as-record';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createStore } from 'zustand/vanilla';
import { isDebugMode } from '~/env';
import { reportCriticalError } from '~/lib/tracing';
import { applyUnseenDelta } from '~/modules/seen/unseen-delta';
import { idbKvStorage } from '~/query/idb-kv-storage';

export type SeenMeta = { tenantId: string; organizationId: string; channelId: string; productType: ProductEntityType; productId: string };

interface SeenBatch {
  tenantId: string;
  organizationId: string;
  productType: SeenTrackedProductType;
  productIds: Set<string>;
}

const flushIntervalMs = appConfig.mode === 'development' ? 10 * 1000 : 60 * 1000;

/** Cap on persisted flushed IDs, evicting oldest first (Sets iterate in insertion order). Evicted IDs may be re-sent; markSeen skips duplicates. */
const flushedIdsMax = 10_000;

const batchKey = (organizationId: string, productType: ProductEntityType) => `${organizationId}:${productType}`;

const pending = new Map<string, SeenBatch>();
/** Ids of a flush whose request has not answered: in neither `pending` nor `flushedIds`, yet seen here. */
const inFlight = new Set<string>();
let flushIntervalId: ReturnType<typeof setInterval> | null = null;

interface SeenStoreState {
  flushedIds: Set<string>;

  markProductSeen: (meta: SeenMeta) => void;
  startFlushInterval: () => void;
  stopFlushInterval: () => void;
  flush: () => Promise<void>;
  /** Reset in-memory state to initial (call on sign-out; persisted data lives in localUserDb). */
  reset: () => void;
}

/** Seen entities queued from IntersectionObserver, batch-flushed to `markSeen`; pending IDs stay in memory, confirmed IDs persist. */
export const seenStore = createStore<SeenStoreState>()(
  devtools(
    persist(
      (set, get) => ({
        flushedIds: new Set(),

        markProductSeen: ({ tenantId, organizationId, channelId, productType, productId }) => {
          if (!isSeenTracked(productType)) return;
          if (get().flushedIds.has(productId) || inFlight.has(productId)) return;

          const key = batchKey(organizationId, productType);
          const batch = pending.get(key) ?? { tenantId, organizationId, productType, productIds: new Set() };
          if (batch.productIds.has(productId)) return;
          batch.productIds.add(productId);
          pending.set(key, batch);

          applyUnseenDelta(channelId, productType, -1);
          if (isDebugMode) console.debug('[SeenStore] queued:', productType, productId.slice(0, 8));
        },

        startFlushInterval: () => {
          if (flushIntervalId) return;
          flushIntervalId = setInterval(() => get().flush(), flushIntervalMs);
        },

        stopFlushInterval: () => {
          if (flushIntervalId) clearInterval(flushIntervalId);
          flushIntervalId = null;
        },

        flush: async () => {
          if (pending.size === 0) return;
          // Snapshot and clear optimistically; failed parts merge back for the next attempt.
          const batches = [...pending.values()];
          pending.clear();
          const parts: SeenBatch[] = [];
          for (const batch of batches) {
            const ids = [...batch.productIds];
            for (const id of ids) inFlight.add(id);
            for (let i = 0; i < ids.length; i += seenBatchMax) parts.push({ ...batch, productIds: new Set(ids.slice(i, i + seenBatchMax)) });
          }
          if (isDebugMode)
            console.debug(
              '[SeenStore] flushing',
              parts.map((part) => `${part.productType}(${part.productIds.size})`),
            );

          // `keepalive` carries a request past an unload, and a browser refuses it past 64 KiB of bodies in flight.
          const keepalive = document.visibilityState === 'hidden';
          // Every request starts in this task: a hidden tab may run no other.
          await Promise.all(
            parts.map(async (part) => {
              const { tenantId, organizationId, productType } = part;
              try {
                const productIds = [...part.productIds];
                await markSeen({ path: { tenantId, organizationId }, body: { productIds, productType }, keepalive });

                const flushedIds = new Set(get().flushedIds);
                for (const id of productIds) flushedIds.add(id);
                for (const id of flushedIds) {
                  if (flushedIds.size <= flushedIdsMax) break;
                  flushedIds.delete(id);
                }
                set({ flushedIds });
              } catch (error) {
                reportCriticalError('seen.flush_failed', error, { product_type: productType });
                const requeued = pending.get(batchKey(organizationId, productType));
                if (requeued) for (const id of part.productIds) requeued.productIds.add(id);
                else pending.set(batchKey(organizationId, productType), part);
              } finally {
                for (const id of part.productIds) inFlight.delete(id);
              }
            }),
          );
          // No refetch needed: markProductSeen already patched unseen counts, and SSE covers external changes.
        },

        reset: () => {
          pending.clear();
          inFlight.clear();
          get().stopFlushInterval();
          set({ flushedIds: new Set() });
        },
      }),
      {
        version: 1,
        name: 'seen',
        skipHydration: true,
        storage: createJSONStorage(() => idbKvStorage('seen')),
        // Sets serialize as arrays; insertion order (oldest first) survives the round-trip.
        partialize: (state) => ({ flushedIds: [...state.flushedIds] }),
        merge: (persisted, current) => ({
          ...current,
          flushedIds: new Set(
            isRecord(persisted) && Array.isArray(persisted.flushedIds)
              ? persisted.flushedIds.filter((id): id is string => typeof id === 'string')
              : [],
          ),
        }),
      },
    ),
    { enabled: isDebugMode, name: 'seen store' },
  ),
);

/** True when this client saw the entity (flushed, in flight or still queued); store internals stay private behind this accessor. */
export function isSeenLocally(entityId: string): boolean {
  if (seenStore.getState().flushedIds.has(entityId) || inFlight.has(entityId)) return true;
  for (const batch of pending.values()) if (batch.productIds.has(entityId)) return true;
  return false;
}
