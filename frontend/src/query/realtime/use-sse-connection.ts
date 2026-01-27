import { useCallback, useEffect, useRef, useState } from 'react';
import { startSyncSpan, syncSpanNames } from '~/lib/tracing';
import { isLeader } from './tab-coordinator';
import type { StreamState } from './user-stream-types';

/** SSE event handlers configuration. */
export interface SSEEventHandlers {
  /** Handler for 'change' events. */
  change?: (event: MessageEvent) => void;
  /** Handler for 'offset' events. */
  offset?: (event: MessageEvent) => void;
  /** Handler for 'ping' events. */
  ping?: () => void;
}

/** Options for useSSEConnection hook. */
export interface UseSSEConnectionOptions {
  /** Full URL to the SSE endpoint (without query params). */
  url: string;
  /** Whether the connection is enabled. */
  enabled?: boolean;
  /** Whether to include credentials (cookies) in the request. */
  withCredentials?: boolean;
  /** Initial offset query parameter value. */
  initialOffset?: string | null;
  /** Event handlers for SSE events. */
  handlers: SSEEventHandlers;
  /** Callback when state changes. */
  onStateChange?: (state: StreamState) => void;
  /** Reconnect delay in ms after error. Default: 5000 */
  reconnectDelay?: number;
  /** Debug label for console logs. */
  debugLabel?: string;
}

/** Return value from useSSEConnection hook. */
export interface UseSSEConnectionReturn {
  /** Current connection state. */
  state: StreamState;
  /** Reference to the EventSource for external checks. */
  eventSourceRef: React.RefObject<EventSource | null>;
  /** Connect to the SSE endpoint. */
  connect: () => void;
  /** Disconnect from the SSE endpoint. */
  disconnect: () => void;
  /** Disconnect and reconnect. */
  reconnect: () => void;
}

/**
 * Low-level hook for managing SSE (EventSource) connections.
 * Handles connection lifecycle, auto-reconnection on error, and state management.
 * Only connects when the tab is the leader (via tab coordinator).
 */
export function useSSEConnection(options: UseSSEConnectionOptions): UseSSEConnectionReturn {
  const {
    url,
    enabled = true,
    withCredentials = false,
    initialOffset,
    handlers,
    onStateChange,
    reconnectDelay = 5000,
    debugLabel = 'SSE',
  } = options;

  const [state, setState] = useState<StreamState>('disconnected');
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs to avoid dependency issues
  const onStateChangeRef = useRef(onStateChange);
  const handlersRef = useRef(handlers);
  onStateChangeRef.current = onStateChange;
  handlersRef.current = handlers;

  // Update state and notify callback
  const updateState = useCallback((newState: StreamState) => {
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  // Connect to SSE endpoint (leader only)
  const connect = useCallback(() => {
    if (!enabled) return;

    // Only leader connects to SSE
    if (!isLeader()) {
      console.debug(`[${debugLabel}] Not leader, listening to broadcasts`);
      updateState('live');
      return;
    }

    // Build URL with query params
    const sseUrl = new URL(url);
    sseUrl.searchParams.set('live', 'sse');
    if (initialOffset) {
      sseUrl.searchParams.set('offset', initialOffset);
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    updateState('connecting');

    // Start tracing span for connection
    const connectSpan = startSyncSpan(syncSpanNames.sseConnect, {
      'sse.url': sseUrl.toString(),
      'sse.is_leader': true,
    });

    const eventSource = new EventSource(sseUrl.toString(), {
      withCredentials,
    });

    eventSource.onopen = () => {
      updateState('catching-up');
      connectSpan.setAttribute('sse.state', 'catching-up');
      connectSpan.setStatus({ code: 1 });
      connectSpan.end();
      console.debug(`[${debugLabel}] Leader connected, catching up...`);
    };

    // Handle 'change' events
    if (handlersRef.current.change) {
      eventSource.addEventListener('change', (e) => handlersRef.current.change?.(e));
    }

    // Handle 'offset' events
    if (handlersRef.current.offset) {
      eventSource.addEventListener('offset', (e) => handlersRef.current.offset?.(e));
    }

    // Handle 'ping' events (keep-alive)
    eventSource.addEventListener('ping', () => {
      handlersRef.current.ping?.();
    });

    eventSource.onerror = () => {
      updateState('error');
      eventSource.close();
      eventSourceRef.current = null;

      // Record reconnect in trace
      const reconnectSpan = startSyncSpan(syncSpanNames.sseReconnect, {
        'sse.reconnect_delay_ms': reconnectDelay,
      });

      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        reconnectSpan.setStatus({ code: 1 });
        reconnectSpan.end();
        connect();
      }, reconnectDelay);
    };

    eventSourceRef.current = eventSource;
  }, [enabled, url, initialOffset, withCredentials, reconnectDelay, debugLabel, updateState]);

  // Disconnect from SSE
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    updateState('disconnected');
  }, [updateState]);

  // Reconnect manually
  const reconnect = useCallback(() => {
    disconnect();
    connect();
  }, [disconnect, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  return {
    state,
    eventSourceRef,
    connect,
    disconnect,
    reconnect,
  };
}
