/**
 * Sync store for offline sync state management.
 *
 * Manages cursor persistence, activity queue, and sync processing state.
 * Used by the app stream handler and catchup processor.
 */

import { create } from 'zustand';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import { isDebugMode } from '~/env';
import type { AppStreamNotification } from '~/query/realtime/types';

/** Storage key for sync state in localStorage */
const SYNC_STORAGE_KEY = 'sync-state';

interface SyncStoreState {
  /** Last processed activity ID (persisted to localStorage) */
  cursor: string | null;
  /** Pending notifications/activities not yet processed */
  activityQueue: AppStreamNotification[];
  /** Whether fetch service is currently processing queue */
  isProcessing: boolean;
  /** Timestamp of last successful sync (ISO string) */
  lastSyncAt: string | null;
  /** Per-scope seq values: orgId → seq (app stream) or entityType → seq (public stream). Persisted. */
  seqs: Record<string, number>;

  // Actions
  /** Update cursor and persist to localStorage */
  setCursor: (cursor: string | null) => void;
  /** Add activities to queue */
  addActivities: (activities: AppStreamNotification[]) => void;
  /** Remove processed activity from queue by entityId */
  removeActivity: (entityId: string) => void;
  /** Clear all pending activities */
  clearQueue: () => void;
  /** Set processing state */
  setIsProcessing: (isProcessing: boolean) => void;
  /** Update last sync timestamp */
  setLastSyncAt: (timestamp: string | null) => void;
  /** Update seq for a scope (orgId or entityType) */
  setSeq: (scope: string, seq: number) => void;
  /** Get seq for a scope (returns 0 if unknown) */
  getSeq: (scope: string) => number;
  /** Reset sync store (on logout) */
  clearSyncStore: () => void;
}

const initialState = {
  cursor: null,
  activityQueue: [],
  isProcessing: false,
  lastSyncAt: null,
  seqs: {} as Record<string, number>,
};

export const useSyncStore = create<SyncStoreState>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...initialState,

        setCursor: (cursor) => {
          set((state) => {
            state.cursor = cursor;
          });
        },

        addActivities: (activities) => {
          set((state) => {
            state.activityQueue.push(...activities);
          });
        },

        removeActivity: (entityId) => {
          set((state) => {
            state.activityQueue = state.activityQueue.filter((a) => a.entityId !== entityId);
          });
        },

        clearQueue: () => {
          set((state) => {
            state.activityQueue = [];
          });
        },

        setIsProcessing: (isProcessing) => {
          set((state) => {
            state.isProcessing = isProcessing;
          });
        },

        setLastSyncAt: (timestamp) => {
          set((state) => {
            state.lastSyncAt = timestamp;
          });
        },

        setSeq: (scope, seq) => {
          set((state) => {
            state.seqs[scope] = seq;
          });
        },

        getSeq: (scope) => {
          return get().seqs[scope] ?? 0;
        },

        clearSyncStore: () => {
          set(() => initialState);
        },
      })),
      {
        name: SYNC_STORAGE_KEY,
        storage: createJSONStorage(() => localStorage),
        // Only persist cursor, lastSyncAt, and seqs (not the queue or processing state)
        partialize: (state) => ({
          cursor: state.cursor,
          lastSyncAt: state.lastSyncAt,
          seqs: state.seqs,
        }),
      },
    ),
    { name: 'SyncStore', enabled: isDebugMode },
  ),
);

/**
 * Get the current cursor value (for SSE reconnect).
 * Returns 'now' if no cursor is set (fresh start).
 */
export function getSyncCursor(): string {
  return useSyncStore.getState().cursor ?? 'now';
}
