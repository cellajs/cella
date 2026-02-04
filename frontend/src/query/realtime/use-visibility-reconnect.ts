import { useCallback, useEffect } from 'react';
import { isLeader } from './tab-coordinator';

/** Options for useVisibilityReconnect hook. */
export interface UseVisibilityReconnectOptions {
  /** Function to call to reconnect. */
  reconnect: () => void;
  /** Reference to the EventSource to check if closed. */
  eventSourceRef: React.RefObject<EventSource | null>;
  /** Whether to require leader status before reconnecting. Default: true */
  requireLeader?: boolean;
  /** Debug label for console logs. */
  debugLabel?: string;
}

/**
 * Hook that reconnects the SSE connection when the tab becomes visible
 * and the connection was closed. By default only triggers for the leader tab,
 * but can be configured to trigger for any tab (e.g., for public streams).
 */
export function useVisibilityReconnect(options: UseVisibilityReconnectOptions): void {
  const { reconnect, eventSourceRef, requireLeader = true, debugLabel = 'SSE' } = options;

  const handleVisibilityChange = useCallback(() => {
    const isLeaderOrNotRequired = !requireLeader || isLeader();
    if (
      document.visibilityState === 'visible' &&
      isLeaderOrNotRequired &&
      eventSourceRef.current?.readyState === EventSource.CLOSED
    ) {
      console.debug(`[${debugLabel}] Tab visible, reconnecting...`);
      reconnect();
    }
  }, [reconnect, eventSourceRef, requireLeader, debugLabel]);

  useEffect(() => {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [handleVisibilityChange]);
}
