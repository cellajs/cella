import { useEffect } from 'react';
import { publicStreamManager, usePublicStreamStore } from './stream-store';
import type { StreamState } from './types';

const debugLabel = 'PublicStream';

/** Options for usePublicStream hook */
export interface UsePublicStreamOptions {
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
  /** Callback when state changes */
  onStateChange?: (state: StreamState) => void;
}

/** Return value from usePublicStream hook */
export interface UsePublicStreamReturn {
  /** Current connection state */
  state: StreamState;
  /** Last received cursor/offset */
  cursor: string | null;
  /** Force reconnect */
  reconnect: () => void;
  /** Disconnect from stream */
  disconnect: () => void;
}

/**
 * Hook to sync public pages via live stream.
 * Uses Zustand store for state management.
 * No tab coordination - each tab maintains its own connection.
 *
 * Flow:
 * 1. Catchup: Fetch delete catch-up as JSON batch
 * 2. Process: Remove deleted pages from cache
 * 3. SSE: Connect with offset=now for live-only updates
 * 4. Invalidate list for modifiedAfter refetch of create/updates
 */
export function usePublicStream(options: UsePublicStreamOptions = {}): UsePublicStreamReturn {
  const { enabled = true, onStateChange } = options;

  // Subscribe to store state
  const state = usePublicStreamStore((s) => s.state);
  const cursor = usePublicStreamStore((s) => s.cursor);

  // Connect/disconnect based on enabled prop
  useEffect(() => {
    if (enabled) {
      publicStreamManager.connect();
    } else {
      publicStreamManager.disconnect();
    }
  }, [enabled]);

  // Notify callback on state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  // Reconnect on visibility change (tab becomes visible)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && enabled && !publicStreamManager.isConnected()) {
        console.debug(`[${debugLabel}] Tab visible, reconnecting...`);
        publicStreamManager.reconnect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled]);

  return {
    state,
    cursor,
    reconnect: () => publicStreamManager.reconnect(),
    disconnect: () => publicStreamManager.disconnect(),
  };
}

/**
 * Component that connects to the public stream for real-time updates.
 * Syncs public entities (e.g., pages) via the `/entities/public/stream` endpoint.
 * No tab coordination - each tab maintains its own connection.
 */
export function PublicStream() {
  usePublicStream({
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
