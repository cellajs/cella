import { useEffect } from 'react';
import { currentSchemaVersion } from 'shared/schema-evolution';
import { createStore } from 'zustand/vanilla';
import { markBundleStale } from '~/query/schema-version-guard';
import type { AppStreamNotification } from './types';

const channelName = 'tab-sync';
const leaderLockName = 'tab-leader';

type BroadcastMessage =
  | { type: 'stream-notification'; notification: AppStreamNotification; organizationId: string }
  | { type: 'schema-version'; version: number };

interface TabCoordinatorState {
  isLeader: boolean;
  isReady: boolean;
  isActive: boolean;
  setIsLeader: (isLeader: boolean) => void;
  setIsReady: (isReady: boolean) => void;
  setIsActive: (isActive: boolean) => void;
}

export const tabCoordinatorStore = createStore<TabCoordinatorState>((set) => ({
  isLeader: false,
  isReady: false,
  isActive: false,
  setIsLeader: (isLeader) => set({ isLeader }),
  setIsReady: (isReady) => set({ isReady }),
  setIsActive: (isActive) => set({ isActive }),
}));

let broadcastChannel: BroadcastChannel | null = null;
let lockController: AbortController | null = null;
const notificationHandlers: Set<(notification: AppStreamNotification, organizationId: string) => void> = new Set();
let initPromise: Promise<void> | null = null;

const isWebLocksAvailable = (): boolean => {
  return typeof navigator !== 'undefined' && 'locks' in navigator;
};

/** Resolves when `signal` aborts. A lock callback awaits this to hold the lock releasably, freeing it for a waiting follower without closing the tab. */
const untilAborted = (signal: AbortSignal): Promise<void> =>
  new Promise<void>((resolve) => {
    if (signal.aborted) return resolve();
    signal.addEventListener('abort', () => resolve(), { once: true });
  });

const isBroadcastChannelAvailable = (): boolean => {
  return typeof BroadcastChannel !== 'undefined';
};

/** Idempotent: resolves once leader status is known, reusing the in-flight promise on repeat calls. */
export const initTabCoordinator = async (): Promise<void> => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const store = tabCoordinatorStore.getState();

    store.setIsActive(true);

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

    if (isWebLocksAvailable()) {
      await attemptLeaderElection();
    } else {
      console.debug('[TabCoordinator] Web Locks not available, assuming leader role');
      store.setIsLeader(true);
      store.setIsReady(true);
    }
  })();

  return initPromise;
};

/**
 * Release leadership so a waiting follower is promoted. Call when the tab leaves the authenticated app: a tab holding leadership while not streaming starves every follower.
 * Clearing `initPromise` lets a later return re-run the election and restore the pending promotion request.
 */
export const releaseTabLeadership = (): void => {
  const store = tabCoordinatorStore.getState();

  lockController?.abort();
  lockController = null;
  initPromise = null;

  store.setIsLeader(false);
  store.setIsReady(false);
  store.setIsActive(false);
};

/** Acquire the leader lock (first tab to acquire it becomes leader); resolves once leader status is known. */
const attemptLeaderElection = (): Promise<void> => {
  const store = tabCoordinatorStore.getState();
  // One controller per election: aborting releases the lock this tab holds or awaits. `ifAvailable` cannot take a signal, so the callback checks it by hand.
  lockController = new AbortController();
  const { signal } = lockController;

  return new Promise<void>((resolveElection) => {
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

    // `ifAvailable` resolves leader status immediately; a plain request would block until the held lock frees.
    navigator.locks
      .request(leaderLockName, { ifAvailable: true }, async (lock) => {
        console.debug('[TabCoordinator] Lock request callback, lock acquired:', !!lock);

        if (lock) {
          console.debug('[TabCoordinator] Acquired leader lock');
          store.setIsLeader(true);
          store.setIsReady(true);
          resolveElection();

          // Returning frees the lock, so hold it until leadership is released or the tab closes.
          await untilAborted(signal);
          return;
        }

        console.debug('[TabCoordinator] Another tab is leader, becoming follower');
        store.setIsLeader(false);
        store.setIsReady(true);
        resolveElection();

        // Runs in the background; does not block initialization.
        waitForLeadership(signal);

        return undefined;
      })
      .catch((error) => {
        console.debug('[TabCoordinator] Leader election error:', error);
        // No election result means no other tab can be assumed to stream: take the role.
        store.setIsLeader(true);
        store.setIsReady(true);
        resolveElection();
      });
  });
};

/** Follower tabs queue here and take over when the current leader closes or releases. */
const waitForLeadership = (signal: AbortSignal): void => {
  const store = tabCoordinatorStore.getState();

  navigator.locks
    .request(leaderLockName, { signal }, async () => {
      console.debug('[TabCoordinator] Promoted to leader');
      store.setIsLeader(true);

      // Returning frees the lock, so hold it until leadership is released.
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

const handleBroadcastMessage = (event: MessageEvent<BroadcastMessage>): void => {
  const store = tabCoordinatorStore.getState();
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
    // The leader already processed this from its own SSE connection.
    for (const handler of notificationHandlers) {
      handler(message.notification, message.organizationId);
    }
  }
};

/** Called by the leader for each SSE notification it receives. */
export const broadcastNotification = (notification: AppStreamNotification, organizationId: string): void => {
  if (broadcastChannel) {
    broadcastChannel.postMessage({
      type: 'stream-notification',
      notification,
      organizationId,
    } satisfies BroadcastMessage);
  }
};

/** Followers register here to receive the leader's notifications. */
export const onNotification = (
  handler: (notification: AppStreamNotification, organizationId: string) => void,
): (() => void) => {
  notificationHandlers.add(handler);
  return () => {
    notificationHandlers.delete(handler);
  };
};

export const isLeader = (): boolean => {
  return tabCoordinatorStore.getState().isLeader;
};

/** Initializes multi-tab coordination. Only mounted in AppLayout. */
export function TabCoordinator() {
  useEffect(() => {
    initTabCoordinator();
  }, []);

  return null;
}
