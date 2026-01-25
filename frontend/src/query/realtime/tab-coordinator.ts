/**
 * Multi-tab coordination for sync engine.
 * Uses Web Locks API for leader election and BroadcastChannel for cross-tab messaging.
 * Only the leader tab maintains the SSE connection; follower tabs receive updates via broadcast.
 *
 * This prevents redundant IDB writes when the React Query cache is persisted across tabs.
 */
import { create } from 'zustand';
import type { UserStreamMessage } from './user-stream-types';

// Tab coordination channel name
const CHANNEL_NAME = 'cella-sync';

// Web Lock name for leader election
const LEADER_LOCK_NAME = 'cella-sync-leader';

/** Message types for BroadcastChannel communication */
type BroadcastMessage =
  | { type: 'stream-message'; message: UserStreamMessage; orgId: string }
  | { type: 'leader-ping'; tabId: string }
  | { type: 'cursor-update'; orgId: string; cursor: string }
  | { type: 'sync-request'; orgId: string };

/** Tab coordinator state */
interface TabCoordinatorState {
  /** Unique identifier for this tab */
  tabId: string;
  /** Whether this tab is the leader (manages SSE connections) */
  isLeader: boolean;
  /** Whether leader election has completed */
  isReady: boolean;
  /** Set whether this tab is the leader */
  setIsLeader: (isLeader: boolean) => void;
  /** Mark coordinator as ready */
  setIsReady: (isReady: boolean) => void;
}

/** Generate a unique tab ID */
const generateTabId = () => `tab-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

/** Zustand store for tab coordination state */
export const useTabCoordinatorStore = create<TabCoordinatorState>((set) => ({
  tabId: generateTabId(),
  isLeader: false,
  isReady: false,
  setIsLeader: (isLeader) => set({ isLeader }),
  setIsReady: (isReady) => set({ isReady }),
}));

// Module-level state for channel and lock
let broadcastChannel: BroadcastChannel | null = null;
let lockController: AbortController | null = null;
let messageHandlers: Set<(message: UserStreamMessage, orgId: string) => void> = new Set();
let cursorHandlers: Set<(orgId: string, cursor: string) => void> = new Set();

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
 */
export const initTabCoordinator = async (): Promise<void> => {
  const store = useTabCoordinatorStore.getState();

  // Set up BroadcastChannel if available
  if (isBroadcastChannelAvailable()) {
    broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    broadcastChannel.onmessage = handleBroadcastMessage;
    console.debug('[TabCoordinator] BroadcastChannel initialized');
  }

  // Attempt leader election via Web Locks
  if (isWebLocksAvailable()) {
    attemptLeaderElection();
  } else {
    // Fallback: become leader if Web Locks not available
    console.debug('[TabCoordinator] Web Locks not available, assuming leader role');
    store.setIsLeader(true);
    store.setIsReady(true);
  }
};

/**
 * Attempt to acquire the leader lock.
 * The first tab to acquire the lock becomes the leader.
 */
const attemptLeaderElection = async (): Promise<void> => {
  const store = useTabCoordinatorStore.getState();
  lockController = new AbortController();

  try {
    // Try to acquire lock - this will wait indefinitely if another tab holds it
    await navigator.locks.request(LEADER_LOCK_NAME, { signal: lockController.signal }, async () => {
      console.debug('[TabCoordinator] Acquired leader lock');
      store.setIsLeader(true);
      store.setIsReady(true);

      // Keep the lock by returning a never-resolving promise
      // The lock is held until the tab closes or releases it
      return new Promise(() => {
        // Send periodic pings to let followers know leader is alive
        const pingInterval = setInterval(() => {
          broadcastMessage({ type: 'leader-ping', tabId: store.tabId });
        }, 5000);

        // Clean up on tab close
        window.addEventListener('beforeunload', () => {
          clearInterval(pingInterval);
        });
      });
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // Lock request was aborted
      console.debug('[TabCoordinator] Leader election aborted');
    } else {
      console.debug('[TabCoordinator] Failed to acquire leader lock:', error);
      // Fallback: become leader
      store.setIsLeader(true);
    }
    store.setIsReady(true);
  }
};

/**
 * Handle incoming BroadcastChannel messages.
 */
const handleBroadcastMessage = (event: MessageEvent<BroadcastMessage>): void => {
  const store = useTabCoordinatorStore.getState();
  const message = event.data;

  switch (message.type) {
    case 'stream-message':
      // Only process if we're a follower
      if (!store.isLeader) {
        for (const handler of messageHandlers) {
          handler(message.message, message.orgId);
        }
      }
      break;

    case 'cursor-update':
      // Update local cursor tracking
      for (const handler of cursorHandlers) {
        handler(message.orgId, message.cursor);
      }
      break;

    case 'leader-ping':
      // Leader is alive, nothing to do
      break;

    case 'sync-request':
      // A follower is requesting sync - leader should ensure stream is active
      if (store.isLeader) {
        console.debug('[TabCoordinator] Received sync request for org:', message.orgId);
      }
      break;
  }
};

/**
 * Broadcast a message to all other tabs.
 */
export const broadcastMessage = (message: BroadcastMessage): void => {
  if (broadcastChannel) {
    broadcastChannel.postMessage(message);
  }
};

/**
 * Broadcast a stream message to follower tabs.
 * Called by the leader when receiving SSE messages.
 */
export const broadcastStreamMessage = (message: UserStreamMessage, orgId: string): void => {
  broadcastMessage({ type: 'stream-message', message, orgId });
};

/**
 * Broadcast a cursor update to all tabs.
 */
export const broadcastCursorUpdate = (orgId: string, cursor: string): void => {
  broadcastMessage({ type: 'cursor-update', orgId, cursor });
};

/**
 * Request the leader to start syncing for an org.
 * Called by followers that need data.
 */
export const requestSync = (orgId: string): void => {
  broadcastMessage({ type: 'sync-request', orgId });
};

/**
 * Register a handler for stream messages.
 * Used by followers to receive updates from the leader.
 */
export const onStreamMessage = (handler: (message: UserStreamMessage, orgId: string) => void): (() => void) => {
  messageHandlers.add(handler);
  return () => {
    messageHandlers.delete(handler);
  };
};

/**
 * Register a handler for cursor updates.
 */
export const onCursorUpdate = (handler: (orgId: string, cursor: string) => void): (() => void) => {
  cursorHandlers.add(handler);
  return () => {
    cursorHandlers.delete(handler);
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

  messageHandlers.clear();
  cursorHandlers.clear();
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
    tabId: state.tabId,
    isLeader: state.isLeader,
    isReady: state.isReady,
  }));
};
