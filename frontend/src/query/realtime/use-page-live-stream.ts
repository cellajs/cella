import { useQueryClient } from '@tanstack/react-query';
import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Page, PagesPublicStreamResponse } from '~/api.gen';
import { pageQueryKeys } from '../../modules/page/query';
import { createHydrateBarrier } from './hydrate-barrier';
import {
  broadcastStreamMessage,
  initTabCoordinator,
  isLeader,
  onStreamMessage,
  useTabCoordinatorStore,
} from './tab-coordinator';
import { useLeaderReconnect } from './use-leader-reconnect';
import { useSSEConnection } from './use-sse-connection';
import { useVisibilityReconnect } from './use-visibility-reconnect';
import type { StreamState } from './user-stream-types';

const API_BASE = appConfig.backendUrl;

/** Message type from public pages stream. */
type PublicStreamMessage = PagesPublicStreamResponse['activities'][number];

/** Options for usePageLiveStream hook. */
export interface UsePageLiveStreamOptions {
  /** Whether the stream is enabled. Default: true */
  enabled?: boolean;
  /** Starting offset: 'now' for live-only, '-1' for full history, or activity ID. */
  initialOffset?: string;
  /** Callback when catch-up is complete. */
  onCatchUpComplete?: (cursor: string | null) => void;
  /** Callback on connection state change. */
  onStateChange?: (state: StreamState) => void;
  /**
   * Whether initial data hydration is complete.
   * When false, stream messages are queued to prevent race conditions.
   * When true (or undefined), queued messages are flushed and processed.
   * Default: true (no barrier, backwards compatible)
   */
  isHydrated?: boolean;
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
 *
 * Uses tab coordination to ensure only one tab maintains the SSE connection:
 * - Leader tab: Opens SSE, broadcasts messages to followers via BroadcastChannel
 * - Follower tabs: Receive messages via broadcast, no SSE connection
 *
 * This prevents redundant IDB writes when the React Query cache is persisted across tabs.
 */
export function usePageLiveStream(options: UsePageLiveStreamOptions = {}): UsePageLiveStreamReturn {
  const { enabled = true, initialOffset = 'now', onCatchUpComplete, onStateChange, isHydrated = true } = options;

  const queryClient = useQueryClient();
  const [cursor, setCursor] = useState<string | null>(null);
  const isLeaderTab = useTabCoordinatorStore((state) => state.isLeader);
  const broadcastCleanupRef = useRef<(() => void) | null>(null);

  // Store callbacks in refs to avoid recreating handlers on every render
  const onCatchUpCompleteRef = useRef(onCatchUpComplete);
  onCatchUpCompleteRef.current = onCatchUpComplete;

  // Process a parsed stream message (extracted for reuse with hydrate barrier and broadcast)
  const processMessage = useCallback(
    (message: PublicStreamMessage, eventId?: string) => {
      // Update cursor from SSE id field
      if (eventId) {
        setCursor(eventId);
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
    },
    [queryClient],
  );

  // Hydrate barrier: queue messages until initial queries complete
  const barrierRef = useRef(createHydrateBarrier<{ message: PublicStreamMessage; eventId?: string }>());

  // Update barrier hydration state
  useEffect(() => {
    if (isHydrated) {
      // Flush queued messages when hydration completes
      const queued = barrierRef.current.complete();
      for (const { message, eventId } of queued) {
        processMessage(message, eventId);
      }
    }
  }, [isHydrated, processMessage]);

  // Handle incoming stream messages (leader only)
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as PublicStreamMessage;
        const eventId = event.lastEventId || undefined;

        // Broadcast to follower tabs
        // PublicStreamMessage is compatible with UserStreamMessage for broadcasting
        broadcastStreamMessage(message as Parameters<typeof broadcastStreamMessage>[0], 'page');

        // Queue if still hydrating initial data
        if (barrierRef.current.enqueue({ message, eventId })) {
          console.debug('[usePageLiveStream] Queued message during hydration:', message.entityType, message.action);
          return;
        }

        // Process immediately if hydration complete
        processMessage(message, eventId);
      } catch (error) {
        console.debug('[usePageLiveStream] Failed to parse message:', error);
      }
    },
    [processMessage],
  );

  // Handle offset event (end of catch-up)
  const handleOffset = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as { cursor: string | null };
      setCursor(data.cursor);
      onCatchUpCompleteRef.current?.(data.cursor);
    } catch (error) {
      console.debug('[usePageLiveStream] Failed to parse offset event:', error);
    }
  }, []);

  // Store handlers in refs for SSE connection
  const handleMessageRef = useRef(handleMessage);
  const handleOffsetRef = useRef(handleOffset);
  handleMessageRef.current = handleMessage;
  handleOffsetRef.current = handleOffset;

  // SSE connection management
  const { state, eventSourceRef, connect, disconnect, reconnect } = useSSEConnection({
    url: `${API_BASE}/page/stream`,
    enabled,
    withCredentials: false,
    initialOffset,
    handlers: {
      change: (e) => handleMessageRef.current(e),
      offset: (e) => handleOffsetRef.current(e),
    },
    onStateChange,
    debugLabel: 'usePageLiveStream',
  });

  // Initialize tab coordinator and connect
  useEffect(() => {
    if (!enabled) return;

    // Initialize tab coordinator (leader election)
    initTabCoordinator();

    // Listen for broadcast messages from leader (follower tabs)
    broadcastCleanupRef.current = onStreamMessage((message) => {
      // Only process if we're a follower (leader already processed via SSE)
      if (!isLeader()) {
        processMessage(message as PublicStreamMessage);
      }
    });

    connect();

    return () => {
      disconnect();
      if (broadcastCleanupRef.current) {
        broadcastCleanupRef.current();
        broadcastCleanupRef.current = null;
      }
    };
  }, [enabled, connect, disconnect, processMessage]);

  // Reconnect when becoming leader
  useLeaderReconnect({ enabled, isLeaderTab, reconnect, debugLabel: 'usePageLiveStream' });

  // Reconnect on visibility change (tab becomes visible)
  useVisibilityReconnect({ reconnect, eventSourceRef, debugLabel: 'usePageLiveStream' });

  return { state, cursor, reconnect, disconnect };
}
