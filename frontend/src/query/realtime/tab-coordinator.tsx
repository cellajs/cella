import { useEffect } from 'react';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { create } from 'zustand';
import { markBundleStale } from '~/query/schema-version-guard';
import type { AppStreamNotification } from './types';

const channelName = 'tab-sync';
const leaderLockName = 'tab-leader';

/** Message types for BroadcastChannel communication */
type BroadcastMessage =
  | { type: 'stream-notification'; notification: AppStreamNotification; organizationId: string }
  | { type: 'schema-version'; version: number };

/** Tab coordinator state */
interface TabCoordinatorState {
  isLeader: boolean;
  isReady: boolean;
  isActive: boolean;
  setIsLeader: (isLeader: boolean) => void;
  setIsReady: (isReady: boolean) => void;
  setIsActive: (isActive: boolean) => void;
}

/** Zustand store for tab coordination state */
export const useTabCoordinatorStore = create<TabCoordinatorState>((set) => ({
  isLeader: false,
  isReady: false,
  isActive: false,
  setIsLeader: (isLeader) => set({ isLeader }),
  setIsReady: (isReady) => set({ isReady }),
  setIsActive: (isActive) => set({ isActive }),
}));

// Module-level state for channel and lock
let broadcastChannel: BroadcastChannel | null = null;
let lockController: AbortController | null = null;
const notificationHandlers: Set<(notification: AppStreamNotification, organizationId: string) => void> = new Set();
let initPromise: Promise<void> | null = null;

/**
 * Check if Web Locks API is available.
 */
const isWebLocksAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
};

/**
 * Check if BroadcastChannel is available.
 */
const isBroadcastChannelAvailable = (): boolean => {
  return typeof BroadcastChannel !== 'undefined';
};

/**
 * Initialize the tab coordinator (BroadcastChannel + leader election via Web Locks). Resolves once
 * leader status is known. Initialization is idempotent across repeated calls.
 */
export const initTabCoordinator = async (): Promise<void> => {
  // Return existing promise if already initializing/initialized
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = useTabCoordinatorStore.getState();

    // Mark coordinator as active
    store.setIsActive(true);

    // Set up BroadcastChannel if available (only once)
    if (isBroadcastChannelAvailable() && !broadcastChannel) {
      broadcastChannel = new BroadcastChannel(channelName);
      broadcastChannel.onmessage = handleBroadcastMessage;
      console.debug('[TabCoordinator] BroadcastChannel initialized');
      // Announce schema version so tabs running a different bundle detect skew.
      broadcastChannel.postMessage({
        type: 'schema-version',
        version: currentSchemaVersion,
      } satisfies BroadcastMessage);
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

/** Acquire the leader lock (first tab to acquire it becomes leader); resolves once leader status is known. */
const attemptLeaderElection = (): Promise<void> => {
  const store = useTabCoordinatorStore.getState();
  lockController = new AbortController();

  return new Promise<void>((resolveElection) => {
    // Debug: Query existing locks first
    if (navigator.locks.query) {
      navigator.locks.query().then((state) => {
        const heldLocks = state.held?.filter((l) => l.name === leaderLockName) ?? [];
        const pendingLocks = state.pending?.filter((l) => l.name === leaderLockName) ?? [];
        console.debug('[TabCoordinator] Lock state before election:', {
          held: heldLocks.length,
          pending: pendingLocks.length,
          heldDetails: heldLocks,
        });
      });
    }

    // Try to acquire the lock with ifAvailable: true first to quickly determine status
    navigator.locks
      .request(leaderLockName, { ifAvailable: true }, async (lock) => {
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
    .request(leaderLockName, { signal: lockController.signal }, async () => {
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

  if (message.type === 'schema-version') {
    if (message.version > currentSchemaVersion) {
      // A newer bundle runs in another tab, stop persisting (schema-version-guard).
      markBundleStale();
    } else if (message.version < currentSchemaVersion) {
      // An older tab announced itself after we booted, re-announce so it learns.
      broadcastChannel?.postMessage({
        type: 'schema-version',
        version: currentSchemaVersion,
      } satisfies BroadcastMessage);
    }
    return;
  }

  if (message.type === 'stream-notification' && !store.isLeader) {
    // Only process if we're a follower (leader already processed via SSE)
    for (const handler of notificationHandlers) {
      handler(message.notification, message.organizationId);
    }
  }
};

/**
 * Broadcast a stream notification to follower tabs.
 * Called by the leader when receiving SSE notifications.
 */
export const broadcastNotification = (notification: AppStreamNotification, organizationId: string): void => {
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'stream-notification',
      notification,
      organizationId,
    } satisfies BroadcastMessage);
  }
};

/**
 * Register a handler for stream notifications.
 * Used by followers to receive updates from the leader.
 */
export const onNotification = (
  handler: (notification: AppStreamNotification, organizationId: string) => void,
): (() => void) => {
  notificationHandlers.add(handler);
  return () => {
    notificationHandlers.delete(handler);
  };
};

/**
 * Check if this tab is currently the leader.
 */
export const isLeader = (): boolean => {
  return useTabCoordinatorStore.getState().isLeader;
};

/** Initializes multi-tab coordination. Only mounted in AppLayout. */
export function TabCoordinator() {
  useEffect(() => {
    initTabCoordinator();
  }, []);

  return null;
}
