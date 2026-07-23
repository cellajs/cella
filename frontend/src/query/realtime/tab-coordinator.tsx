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
 * Resolve when `signal` aborts. A lock callback awaits this to hold the lock releasably: the
 * callback returns once the signal fires, which frees the lock for a waiting follower without
 * requiring the tab to close.
 */
const untilAborted = (signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

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

/**
 * Release this tab's leadership so a waiting follower is promoted. Call when the tab leaves the
 * authenticated app: leadership gates who maintains the SSE stream, so a tab that holds it while no
 * longer streaming starves every follower. A full tab close frees the lock via realm destruction.
 *
 * Clearing `initPromise` lets a later return to the app run the election again and take whichever
 * role is open: follower while another tab leads, leader when none does. That re-run also restores
 * the pending promotion request, so a sole tab picks the stream back up when it returns.
 */
export const releaseTabLeadership = (): void => {
  const store = useTabCoordinatorStore.getState();

  lockController?.abort();
  lockController = null;
  initPromise = null;

  store.setIsLeader(false);
  store.setIsReady(false);
  store.setIsActive(false);
};

/** Acquire the leader lock (first tab to acquire it becomes leader); resolves once leader status is known. */
const attemptLeaderElection = (): Promise<void> => {
  const store = useTabCoordinatorStore.getState();
  // One controller per election: aborting it releases whichever lock this tab currently holds or
  // awaits. `ifAvailable` cannot be combined with a signal, so the callback checks it by hand.
  lockController = new AbortController();
  const { signal } = lockController;

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

          // Hold the lock until leadership is released (or the tab closes), then return to free it
          await untilAborted(signal);
          return;
        }

        // Lock not available - we're a follower
        console.debug('[TabCoordinator] Another tab is leader, becoming follower');
        store.setIsLeader(false);
        store.setIsReady(true);
        resolveElection();

        // Now wait for leadership in case current leader closes or leaves the app
        // This runs in background and doesn't block initialization
        waitForLeadership(signal);

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
const waitForLeadership = (signal: AbortSignal): void => {
  const store = useTabCoordinatorStore.getState();

  navigator.locks
    .request(leaderLockName, { signal }, async () => {
      console.debug('[TabCoordinator] Promoted to leader');
      store.setIsLeader(true);

      // Hold the lock until leadership is released, then return to free it
      await untilAborted(signal);
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
