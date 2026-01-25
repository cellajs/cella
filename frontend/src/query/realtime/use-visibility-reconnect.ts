import { useEffect } from 'react';
import { isLeader } from './tab-coordinator';

/** Options for useVisibilityReconnect hook. */
export interface UseVisibilityReconnectOptions {
  /** Function to call to reconnect. */
  reconnect: () => void;
  /** Reference to the EventSource to check if closed. */
  eventSourceRef: React.RefObject<EventSource | null>;
  /** Debug label for console logs. */
  debugLabel?: string;
}

/**
 * Hook that reconnects the SSE connection when the tab becomes visible
 * and the connection was closed. Only triggers for the leader tab.
 */
export function useVisibilityReconnect(options: UseVisibilityReconnectOptions): void {
  const { reconnect, eventSourceRef, debugLabel = 'SSE' } = options;

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (
        document.visibilityState === 'visible' &&
        isLeader() &&
        eventSourceRef.current?.readyState === EventSource.CLOSED
      ) {
        console.debug(`[${debugLabel}] Leader tab visible, reconnecting...`);
        reconnect();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reconnect, eventSourceRef, debugLabel]);
}
