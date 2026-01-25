import { useEffect } from 'react';

/** Options for useLeaderReconnect hook. */
export interface UseLeaderReconnectOptions {
  /** Whether the stream is enabled. */
  enabled: boolean;
  /** Whether this tab is currently the leader. */
  isLeaderTab: boolean;
  /** Function to call to reconnect. */
  reconnect: () => void;
  /** Debug label for console logs. */
  debugLabel?: string;
}

/**
 * Hook that reconnects the SSE connection when this tab becomes the leader.
 * Used in multi-tab coordination where only the leader maintains the SSE connection.
 */
export function useLeaderReconnect(options: UseLeaderReconnectOptions): void {
  const { enabled, isLeaderTab, reconnect, debugLabel = 'SSE' } = options;

  useEffect(() => {
    if (enabled && isLeaderTab) {
      console.debug(`[${debugLabel}] Became leader, connecting to SSE...`);
      reconnect();
    }
  }, [enabled, isLeaderTab, reconnect, debugLabel]);
}
