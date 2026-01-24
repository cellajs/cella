import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getStoredOffset, updateStoredOffset } from './offset-store';
import type {
  OffsetEvent,
  StreamMessage,
  StreamState,
  UseLiveStreamOptions,
  UseLiveStreamReturn,
} from './stream-types';
import { useSyncCoordinatorStore } from './sync-coordinator';
import {
  broadcastCursorUpdate,
  broadcastStreamMessage,
  isLeader,
  onCursorUpdate,
  onStreamMessage,
  useTabCoordinatorStore,
} from './tab-coordinator';

const API_BASE = appConfig.backendUrl;

/**
 * Hook to connect to the live stream SSE endpoint.
 * Handles catch-up and live updates for product entities in an organization.
 *
 * @example
 * ```tsx
 * const { state, cursor } = useLiveStream({
 *   orgId: organization.id,
 *   onMessage: (message) => {
 *     // Update React Query cache with new entity data
 *     queryClient.setQueryData(['pages', message.entityId], message.data);
 *   },
 * });
 * ```
 */
const EMPTY_ENTITY_TYPES: StreamMessage['entityType'][] = [];

export function useLiveStream(options: UseLiveStreamOptions): UseLiveStreamReturn {
  const {
    orgId,
    entityTypes = EMPTY_ENTITY_TYPES,
    initialOffset = 'now',
    onMessage,
    onCatchUpComplete,
    onStateChange,
    enabled = true,
  } = options;

  const [state, setState] = useState<StreamState>('disconnected');
  const [cursor, setCursor] = useState<string | null>(null);

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Store callbacks in refs to avoid recreating handlers on every render
  const onMessageRef = useRef(onMessage);
  const onStateChangeRef = useRef(onStateChange);
  const onCatchUpCompleteRef = useRef(onCatchUpComplete);
  onMessageRef.current = onMessage;
  onStateChangeRef.current = onStateChange;
  onCatchUpCompleteRef.current = onCatchUpComplete;

  // Sync coordinator for upstream-first sync flow
  const syncCoordinator = useSyncCoordinatorStore();

  // Track if we're in catch-up mode (before receiving 'offset' event)
  const isCatchingUpRef = useRef(true);

  // Update state and notify callback
  const updateState = useCallback((newState: StreamState) => {
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  // Handle incoming SSE messages (leader only)
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as StreamMessage;

        // Update cursor from SSE id field
        if (event.lastEventId) {
          setCursor(event.lastEventId);
          // Persist offset to IndexedDB (debounced)
          updateStoredOffset(orgId, event.lastEventId);
          // Broadcast cursor update to followers
          broadcastCursorUpdate(orgId, event.lastEventId);
        }

        // Check for conflicts with queued mutations (upstream-first)
        syncCoordinator.handleStreamMessage(message);

        // Broadcast message to follower tabs
        broadcastStreamMessage(message, orgId);

        // Call message handler
        onMessageRef.current?.(message);
      } catch (error) {
        console.debug('[useLiveStream] Failed to parse message:', error);
      }
    },
    [orgId],
  );

  // Handle offset event (end of catch-up)
  const handleOffset = useCallback(
    (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as OffsetEvent;
        setCursor(data.cursor);
        // Persist offset to IndexedDB
        if (data.cursor) {
          updateStoredOffset(orgId, data.cursor);
          // Broadcast cursor update to followers
          broadcastCursorUpdate(orgId, data.cursor);
        }
        isCatchingUpRef.current = false;
        updateState('live');

        // Mark sync coordinator as caught up
        // React Query will auto-resume paused mutations when online
        syncCoordinator.setCaughtUp();

        onCatchUpCompleteRef.current?.(data.cursor);
      } catch (error) {
        console.debug('[useLiveStream] Failed to parse offset event:', error);
      }
    },
    [orgId, updateState],
  );

  // Handle broadcast messages from leader (follower only)
  const handleBroadcastMessage = useCallback(
    (message: StreamMessage, msgOrgId: string) => {
      if (msgOrgId !== orgId) return;
      onMessageRef.current?.(message);
    },
    [orgId],
  );

  // Handle cursor updates from leader (follower only)
  const handleCursorBroadcast = useCallback(
    (msgOrgId: string, newCursor: string) => {
      if (msgOrgId !== orgId) return;
      setCursor(newCursor);
    },
    [orgId],
  );

  // Store handlers in refs to avoid dependency issues in connect
  const handleMessageRef = useRef(handleMessage);
  const handleOffsetRef = useRef(handleOffset);
  handleMessageRef.current = handleMessage;
  handleOffsetRef.current = handleOffset;

  // Connect to SSE endpoint (leader only)
  const connect = useCallback(async () => {
    if (!enabled || !orgId) return;

    // Check if this tab is the leader
    if (!isLeader()) {
      console.debug('[useLiveStream] Not leader, listening to broadcasts');
      updateState('live'); // Followers are always "live" via broadcasts
      return;
    }

    // Get stored offset, fall back to initialOffset
    let offset = initialOffset;
    const storedOffset = getStoredOffset(orgId);
    if (storedOffset) {
      offset = storedOffset;
      console.debug('[useLiveStream] Using stored offset:', storedOffset);
    }

    // Build URL with query params
    const url = new URL(`${API_BASE}/organizations/${orgId}/sync/stream`);
    url.searchParams.set('live', 'sse');

    if (offset) {
      url.searchParams.set('offset', offset);
    }

    if (entityTypes.length > 0) {
      url.searchParams.set('entityTypes', entityTypes.join(','));
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    updateState('connecting');
    isCatchingUpRef.current = true;

    // Start sync session
    syncCoordinator.startSync(orgId);

    const eventSource = new EventSource(url.toString(), {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      updateState('catching-up');
    };

    // Handle 'change' events (entity updates)
    eventSource.addEventListener('change', (e) => handleMessageRef.current(e));

    // Handle 'offset' event (catch-up complete)
    eventSource.addEventListener('offset', (e) => handleOffsetRef.current(e));

    // Handle 'ping' events (keep-alive)
    eventSource.addEventListener('ping', () => {
      // Connection is alive, nothing to do
    });

    eventSource.onerror = () => {
      updateState('error');
      eventSource.close();
      eventSourceRef.current = null;

      // Reconnect after delay
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    };

    eventSourceRef.current = eventSource;
  }, [enabled, orgId, entityTypes, initialOffset, updateState]);

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

  // Subscribe to tab coordinator state changes
  const isLeaderTab = useTabCoordinatorStore((state) => state.isLeader);

  // Connect on mount, disconnect on unmount
  // Also handle leader changes (reconnect if we become leader)
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [enabled, orgId, isLeaderTab, connect, disconnect]);

  // Register for broadcast messages (followers only)
  useEffect(() => {
    if (!enabled || isLeaderTab) return;

    const unsubMessage = onStreamMessage(handleBroadcastMessage);
    const unsubCursor = onCursorUpdate(handleCursorBroadcast);

    return () => {
      unsubMessage();
      unsubCursor();
    };
  }, [enabled, isLeaderTab, handleBroadcastMessage, handleCursorBroadcast]);

  return {
    state,
    cursor,
    reconnect,
    disconnect,
  };
}
