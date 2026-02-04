import { useEffect, useRef } from 'react';

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
 * Only triggers on leader *changes*, not on initial mount.
 */
export function useLeaderReconnect(options: UseLeaderReconnectOptions): void {
  const { enabled, isLeaderTab, reconnect, debugLabel = 'SSE' } = options;
  const isFirstMount = useRef(true);
  const wasLeader = useRef(isLeaderTab);

  useEffect(() => {
    // Skip initial mount - main useEffect handles that
    if (isFirstMount.current) {
      isFirstMount.current = false;
      wasLeader.current = isLeaderTab;
      return;
    }

    // Only reconnect when becoming leader (was not leader, now is leader)
    if (enabled && isLeaderTab && !wasLeader.current) {
      console.debug(`[${debugLabel}] Became leader, connecting to SSE...`);
      reconnect();
    }

    wasLeader.current = isLeaderTab;
  }, [enabled, isLeaderTab, reconnect, debugLabel]);
}
