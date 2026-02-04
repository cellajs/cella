import { useEffect } from 'react';
import { handleAppStreamNotification } from './app-stream-handler';
import { appStreamManager, useAppStreamStore } from './stream-store';
import { isLeader, useTabCoordinatorStore } from './tab-coordinator';
import type { UseAppStreamOptions, UseAppStreamReturn } from './types';

const debugLabel = 'AppStream';

/**
 * Hook to connect to the app-scoped stream for real-time updates.
 * Uses Zustand store for state management.
 *
 * Two-phase approach:
 * 1. Fetch catchup as JSON batch → process with batch processor
 * 2. Connect SSE with cursor for live-only updates
 *
 * Uses tab coordination to ensure only one tab maintains the SSE connection:
 * - Leader tab: Opens SSE, broadcasts notifications to followers via BroadcastChannel
 * - Follower tabs: Receive notifications via broadcast, no SSE connection
 */
// TODO feels like the logic is too close to the stream-store.tsx itself? Either combine or reduce the store for things
//  that are rewritten here
export function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const {
    enabled = true,
    onNotification: _onNotification,
    onCatchUpComplete: _onCatchUpComplete,
    onStateChange,
  } = options;

  // Subscribe to store state
  const state = useAppStreamStore((s) => s.state);
  const cursor = useAppStreamStore((s) => s.cursor);
  const isLeaderTab = useTabCoordinatorStore((s) => s.isLeader);

  // Connect/disconnect based on enabled prop
  useEffect(() => {
    if (enabled) {
      appStreamManager.connect();
    } else {
      appStreamManager.disconnect();
    }

    return () => {
      // Disconnect on unmount for app stream (auth-scoped)
      appStreamManager.disconnect();
    };
  }, [enabled]);

  // Notify callback on state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Reconnect when becoming leader
  useEffect(() => {
    if (enabled && isLeaderTab && !appStreamManager.isConnected()) {
      console.debug(`[${debugLabel}] Became leader, reconnecting...`);
      appStreamManager.reconnect();
    }
  }, [enabled, isLeaderTab]);

  // Reconnect on visibility change (tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && isLeader() && !appStreamManager.isConnected()) {
        console.debug(`[${debugLabel}] Tab visible, reconnecting...`);
        appStreamManager.reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled]);

  return {
    state,
    cursor,
    reconnect: () => appStreamManager.reconnect(),
    disconnect: () => appStreamManager.disconnect(),
  };
}

/**
 * Component that connects to the app-scoped stream for real-time updates.
 * Handles membership, organization, and product entity events via CDC → ActivityBus pipeline.
 * Use in AppLayout for app-wide real-time sync.
 */
export default function AppStream() {
  useAppStream({
    onNotification: handleAppStreamNotification,
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
