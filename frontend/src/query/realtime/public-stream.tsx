import { useEffect } from 'react';
import { publicStreamManager } from './stream-store';

const debugLabel = 'PublicStream';

/** Options for usePublicStream hook */
interface UsePublicStreamOptions {
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
}

/** Return value from usePublicStream hook */
interface UsePublicStreamReturn {
  /** Current connection state */
  state: string;
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
 * 1. Catchup: Fetch catchup summary as JSON batch
 * 2. Process: Detect seq deltas; tombstone rows remove soft-deleted pages from cache
 * 3. SSE: Connect with offset=now for live-only updates
 * 4. Patch or invalidate entity lists for live updates
 */
function usePublicStream(options: UsePublicStreamOptions = {}): UsePublicStreamReturn {
  const { enabled = true } = options;

  // Subscribe to store state
  const state = publicStreamManager.useStore((s) => s.state);
  const cursor = publicStreamManager.useStore((s) => s.cursor);

  // Connect/disconnect based on enabled prop
  useEffect(() => {
    if (enabled) {
      publicStreamManager.connect();
    } else {
      publicStreamManager.disconnect();
    }
  }, [enabled]);

  // Debug log state transitions
  useEffect(() => {
    if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [state]);

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
  usePublicStream();
  return null;
}
