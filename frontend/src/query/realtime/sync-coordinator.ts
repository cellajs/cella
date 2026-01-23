/**
 * Sync coordinator.
 * Tracks sync state for the upstream-first flow:
 * 1. Catch up from stream (receive server changes)
 * 2. Mutations are handled by React Query (pauses when offline)
 *
 * Note: Conflict detection is now per-field via TxMetadata in mutations.
 */

import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';
import type { StreamMessage } from './stream-types';

/** Sync coordinator state */
interface SyncCoordinatorState {
  /** Whether a sync is in progress */
  isSyncing: boolean;
  /** Whether catch-up phase is complete */
  isCaughtUp: boolean;
  /** Current organization being synced */
  currentOrgId: string | null;
  /** Last sync error */
  lastError: string | null;
}

/** Sync coordinator actions */
interface SyncCoordinatorActions {
  /** Start sync for an organization */
  startSync: (orgId: string) => void;
  /** Mark catch-up as complete */
  setCaughtUp: () => void;
  /** Handle incoming stream message */
  handleStreamMessage: (message: StreamMessage) => void;
  /** Reset coordinator state */
  reset: () => void;
}

type SyncCoordinatorStore = SyncCoordinatorState & SyncCoordinatorActions;

/**
 * Sync coordinator store.
 * Simplified: mutations are now handled by React Query, not custom outbox.
 */
export const useSyncCoordinatorStore = create<SyncCoordinatorStore>((set) => ({
  isSyncing: false,
  isCaughtUp: false,
  currentOrgId: null,
  lastError: null,

  startSync: (orgId) => {
    set({
      isSyncing: true,
      isCaughtUp: false,
      currentOrgId: orgId,
      lastError: null,
    });
  },

  setCaughtUp: () => {
    set({ isCaughtUp: true });

    // After catch-up, RQ mutations will auto-resume if online
    if (onlineManager.isOnline()) {
      console.debug('[SyncCoordinator] Catch-up complete, mutations will resume');
    }
  },

  handleStreamMessage: (message) => {
    // Stream messages are handled by entity-specific hooks (e.g., usePageLiveStream)
    // This is just for logging/debugging
    console.debug('[SyncCoordinator] Stream message:', message.entityType, message.action, message.entityId);
  },

  reset: () => {
    set({
      isSyncing: false,
      isCaughtUp: false,
      currentOrgId: null,
      lastError: null,
    });
  },
}));
