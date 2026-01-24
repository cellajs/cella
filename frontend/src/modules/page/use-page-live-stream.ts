import { useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, PagesPublicStreamResponse } from '~/api.gen';
import type { StreamState } from '~/query/realtime';
import { pageQueryKeys } from './query';

const API_BASE = appConfig.backendUrl;

/** Message type from public pages stream. */
type PublicStreamMessage = PagesPublicStreamResponse['activities'][number];

/** Options for usePageLiveStream hook. */
export interface UsePageLiveStreamOptions {
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
  /** Starting offset: 'now' for live-only, '-1' for full history, or activity ID. */
  initialOffset?: string;
  /** Callback on connection state change. */
  onStateChange?: (state: StreamState) => void;
}

/** Return value from usePageLiveStream hook. */
export interface UsePageLiveStreamReturn {
  /** Current connection state. */
  state: StreamState;
  /** Last known cursor (activity ID). */
  cursor: string | null;
  /** Manually reconnect. */
  reconnect: () => void;
  /** Manually disconnect. */
  disconnect: () => void;
}

/**
 * Hook to sync pages via public live stream.
 * Automatically updates React Query cache when stream messages arrive.
 * Uses the public `/page/stream` endpoint (no auth required).
 */
export function usePageLiveStream(options: UsePageLiveStreamOptions = {}): UsePageLiveStreamReturn {
  const { enabled = true, initialOffset = 'now', onStateChange } = options;

  const queryClient = useQueryClient();
  const [state, setState] = useState<StreamState>('disconnected');
  const [cursor, setCursor] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Update state and notify callback
  const updateState = useCallback(
    (newState: StreamState) => {
      setState(newState);
      onStateChange?.(newState);
    },
    [onStateChange],
  );

  // Handle incoming stream messages
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as PublicStreamMessage;

        // Update cursor from SSE id field
        if (event.lastEventId) {
          setCursor(event.lastEventId);
        }

        // Only handle page entities
        if (message.entityType !== 'page') return;

        const { entityId, action, data } = message;

        switch (action) {
          case 'create':
            // Invalidate list queries to refetch with new page
            queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
            // Set detail query data if we have the full entity
            if (data) {
              queryClient.setQueryData(pageQueryKeys.detail.byId(entityId), data as Page);
            }
            break;

          case 'update':
            // Update in cache if we have entity data, otherwise invalidate to refetch
            if (data) {
              queryClient.setQueryData(pageQueryKeys.detail.byId(entityId), data as Page);
            } else {
              // Public stream sends data: null - invalidate so detail view refetches
              queryClient.invalidateQueries({ queryKey: pageQueryKeys.detail.byId(entityId) });
            }
            // Invalidate list to refetch (entity data in list may differ from detail)
            queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
            break;

          case 'delete':
            // Remove from detail cache
            queryClient.removeQueries({ queryKey: pageQueryKeys.detail.byId(entityId) });
            // Invalidate list
            queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
            break;
        }
      } catch (error) {
        console.debug('[usePageLiveStream] Failed to parse message:', error);
      }
    },
    [queryClient],
  );

  // Handle offset event (end of catch-up)
  const handleOffset = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { cursor: string | null };
        setCursor(data.cursor);
        updateState('live');
      } catch (error) {
        console.debug('[usePageLiveStream] Failed to parse offset event:', error);
      }
    },
    [updateState],
  );

  // Connect to SSE endpoint
  const connect = useCallback(() => {
    if (!enabled) return;

    // Build URL with query params
    const url = new URL(`${API_BASE}/page/stream`);
    url.searchParams.set('live', 'sse');
    if (initialOffset) {
      url.searchParams.set('offset', initialOffset);
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    updateState('connecting');

    const eventSource = new EventSource(url.toString());

    eventSource.onopen = () => {
      updateState('catching-up');
    };

    // Handle 'change' events (entity updates)
    eventSource.addEventListener('change', handleMessage);

    // Handle 'offset' event (catch-up complete)
    eventSource.addEventListener('offset', handleOffset);

    eventSource.onerror = () => {
      updateState('error');
      eventSource.close();

      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    eventSourceRef.current = eventSource;
  }, [enabled, initialOffset, handleMessage, handleOffset, updateState]);

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

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, connect, disconnect]);

  return { state, cursor, reconnect, disconnect };
}
