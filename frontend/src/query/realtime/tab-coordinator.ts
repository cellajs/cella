/**
 * Multi-tab coordination for sync engine.
 * Uses Web Locks API for leader election and BroadcastChannel for cross-tab messaging.
 *
 * The leader tab:
 * - Maintains SSE connections (prevents redundant server connections)
 * - Broadcasts SSE notifications to follower tabs
 * - Is the only tab that persists mutations to storage (prevents cross-tab conflicts)
 *
 * Follower tabs:
 * - Receive SSE updates via BroadcastChannel
 * - Keep mutations in-memory only (not persisted)
 */
import { create } from 'zustand';
import type { AppStreamMessage } from './app-stream-types';

// Tab coordination channel name
const CHANNEL_NAME = 'cella-sync';

// Web Lock name for leader election
const LEADER_LOCK_NAME = 'cella-sync-leader';

/** Message types for BroadcastChannel communication */
type BroadcastMessage = { type: 'stream-message'; message: AppStreamMessage; orgId: string };

/** Tab coordinator state */
interface TabCoordinatorState {
  /** Whether this tab is the leader (manages SSE connections and mutation persistence) */
  isLeader: boolean;
  /** Whether leader election has completed */
  isReady: boolean;
  /** Set whether this tab is the leader */
  setIsLeader: (isLeader: boolean) => void;
  /** Mark coordinator as ready */
  setIsReady: (isReady: boolean) => void;
}

/** Zustand store for tab coordination state */
export const useTabCoordinatorStore = create<TabCoordinatorState>((set) => ({
  isLeader: false,
  isReady: false,
  setIsLeader: (isLeader) => set({ isLeader }),
  setIsReady: (isReady) => set({ isReady }),
}));

// Module-level state for channel and lock
let broadcastChannel: BroadcastChannel | null = null;
let lockController: AbortController | null = null;
let notificationHandlers: Set<(notification: AppStreamMessage, orgId: string) => void> = new Set();
let initPromise: Promise<void> | null = null;

/**
 * Check if Web Locks API is available.
 */
export const isWebLocksAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
};

/**
 * Check if BroadcastChannel is available.
 */
export const isBroadcastChannelAvailable = (): boolean => {
  return typeof BroadcastChannel !== 'undefined';
};

/**
 * Initialize the tab coordinator.
 * Sets up BroadcastChannel and attempts leader election via Web Locks.
 * Returns a promise that resolves when leader election is complete.
 * Safe to call multiple times - initialization only happens once.
 */
export const initTabCoordinator = async (): Promise<void> => {
  // Return existing promise if already initializing/initialized
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = useTabCoordinatorStore.getState();

    // Set up BroadcastChannel if available (only once)
    if (isBroadcastChannelAvailable() && !broadcastChannel) {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannel.onmessage = handleBroadcastMessage;
      console.debug('[TabCoordinator] BroadcastChannel initialized');
    }

    // Attempt leader election via Web Locks
    if (isWebLocksAvailable()) {
      await attemptLeaderElection();
    } else {
      // Fallback: become leader if Web Locks not available
      console.debug('[TabCoordinator] Web Locks not available, assuming leader role');
      store.setIsLeader(true);
      store.setIsReady(true);
    }
  })();

  return initPromise;
};

/**
 * Attempt to acquire the leader lock.
 * The first tab to acquire the lock becomes the leader.
 * Returns a promise that resolves once we know our leader status.
 */
const attemptLeaderElection = (): Promise<void> => {
  const store = useTabCoordinatorStore.getState();
  lockController = new AbortController();

  return new Promise<void>((resolveElection) => {
    // Debug: Query existing locks first
    if (navigator.locks.query) {
      navigator.locks.query().then((state) => {
        const heldLocks = state.held?.filter((l) => l.name === LEADER_LOCK_NAME) ?? [];
        const pendingLocks = state.pending?.filter((l) => l.name === LEADER_LOCK_NAME) ?? [];
        console.debug('[TabCoordinator] Lock state before election:', {
          held: heldLocks.length,
          pending: pendingLocks.length,
          heldDetails: heldLocks,
        });
      });
    }

    // Try to acquire the lock with ifAvailable: true first to quickly determine status
    navigator.locks
      .request(LEADER_LOCK_NAME, { ifAvailable: true }, async (lock) => {
        console.debug('[TabCoordinator] Lock request callback, lock acquired:', !!lock);

        if (lock) {
          // We got the lock - we're the leader
          console.debug('[TabCoordinator] Acquired leader lock');
          store.setIsLeader(true);
          store.setIsReady(true);
          resolveElection();

          // Keep the lock by returning a never-resolving promise
          // The lock is held until the tab closes or releases it
          return new Promise<void>(() => {});
        }

        // Lock not available - we're a follower
        console.debug('[TabCoordinator] Another tab is leader, becoming follower');
        store.setIsLeader(false);
        store.setIsReady(true);
        resolveElection();

        // Now wait for leadership in case current leader closes
        // This runs in background and doesn't block initialization
        waitForLeadership();

        return undefined;
      })
      .catch((error) => {
        console.debug('[TabCoordinator] Leader election error:', error);
        // Fallback: become leader on error
        store.setIsLeader(true);
        store.setIsReady(true);
        resolveElection();
      });
  });
};

/**
 * Wait in background for leadership to become available.
 * Called by follower tabs to eventually become leader when current leader closes.
 */
const waitForLeadership = (): void => {
  const store = useTabCoordinatorStore.getState();
  lockController = new AbortController();

  navigator.locks
    .request(LEADER_LOCK_NAME, { signal: lockController.signal }, async () => {
      console.debug('[TabCoordinator] Promoted to leader');
      store.setIsLeader(true);

      // Keep the lock by returning a never-resolving promise
      return new Promise<void>(() => {});
    })
    .catch((error) => {
      if (error instanceof DOMException && error.name === 'AbortError') {
        console.debug('[TabCoordinator] Leadership wait aborted');
      } else {
        console.debug('[TabCoordinator] Leadership wait error:', error);
      }
    });
};

/**
 * Handle incoming BroadcastChannel messages.
 */
const handleBroadcastMessage = (event: MessageEvent<BroadcastMessage>): void => {
  const store = useTabCoordinatorStore.getState();
  const message = event.data;

  if (message.type === 'stream-message' && !store.isLeader) {
    // Only process if we're a follower (leader already processed via SSE)
    for (const handler of notificationHandlers) {
      handler(message.message, message.orgId);
    }
  }
};

/**
 * Broadcast a stream notification to follower tabs.
 * Called by the leader when receiving SSE notifications.
 */
export const broadcastNotification = (notification: AppStreamMessage, orgId: string): void => {
  if (broadcastChannel) {
    broadcastChannel.postMessage({ type: 'stream-message', message: notification, orgId } satisfies BroadcastMessage);
  }
};

/**
 * Register a handler for stream notifications.
 * Used by followers to receive updates from the leader.
 */
export const onNotification = (handler: (notification: AppStreamMessage, orgId: string) => void): (() => void) => {
  notificationHandlers.add(handler);
  return () => {
    notificationHandlers.delete(handler);
  };
};

/**
 * Release leadership and clean up resources.
 */
export const releaseLeadership = (): void => {
  if (lockController) {
    lockController.abort();
    lockController = null;
  }
  useTabCoordinatorStore.getState().setIsLeader(false);
};

/**
 * Clean up tab coordinator resources.
 */
export const cleanupTabCoordinator = (): void => {
  releaseLeadership();

  if (broadcastChannel) {
    broadcastChannel.close();
    broadcastChannel = null;
  }

  notificationHandlers.clear();
  initPromise = null;
};

/**
 * Check if this tab is currently the leader.
 */
export const isLeader = (): boolean => {
  return useTabCoordinatorStore.getState().isLeader;
};

/**
 * React hook to get tab coordinator state.
 */
export const useTabCoordinator = () => {
  return useTabCoordinatorStore((state) => ({
    isLeader: state.isLeader,
    isReady: state.isReady,
  }));
};
