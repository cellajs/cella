import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type {
  UserStreamMessage,
  UserStreamOffsetEvent,
  UseUserStreamOptions,
  UseUserStreamReturn,
} from './user-stream-types';

const API_BASE = appConfig.backendUrl;

/**
 * Hook to connect to the user-scoped stream SSE endpoint.
 * Handles membership, organization, and product entity events for the current user.
 *
 * Uses tab coordination to ensure only one tab maintains the SSE connection:
 * - Leader tab: Opens SSE, broadcasts messages to followers via BroadcastChannel
 * - Follower tabs: Receive messages via broadcast, no SSE connection
 *
 * This prevents redundant IDB writes when cache is persisted across tabs.
 *
 * @example
 * ```tsx
 * const { state } = useUserStream({
 *   onMessage: handleUserStreamMessage,
 * });
 * ```
 */
export function useUserStream(options: UseUserStreamOptions): UseUserStreamReturn {
  const {
    initialOffset = 'now',
    onMessage,
    onCatchUpComplete,
    onStateChange,
    enabled = true,
    isHydrated = true,
  } = options;

  const [cursor, setCursor] = useState<string | null>(null);
  const isLeaderTab = useTabCoordinatorStore((state) => state.isLeader);
  const broadcastCleanupRef = useRef<(() => void) | null>(null);

  // Store callbacks in refs to avoid recreating handlers on every render
  const onMessageRef = useRef(onMessage);
  const onCatchUpCompleteRef = useRef(onCatchUpComplete);
  onMessageRef.current = onMessage;
  onCatchUpCompleteRef.current = onCatchUpComplete;

  // Hydrate barrier: queue messages until initial queries complete
  const barrierRef = useRef(createHydrateBarrier<{ message: UserStreamMessage; eventId?: string }>());

  // Update barrier hydration state
  useEffect(() => {
    if (isHydrated) {
      // Flush queued messages when hydration completes
      const queued = barrierRef.current.complete();
      for (const { message, eventId } of queued) {
        if (eventId) setCursor(eventId);
        onMessageRef.current?.(message);
      }
    }
  }, [isHydrated]);

  // Process a message (used by both leader and followers)
  const processMessage = useCallback((message: UserStreamMessage, eventId?: string) => {
    // Queue if still hydrating initial data
    if (barrierRef.current.enqueue({ message, eventId })) {
      console.debug('[useUserStream] Queued message during hydration:', message.entityType, message.action);
      return;
    }

    if (eventId) setCursor(eventId);
    onMessageRef.current?.(message);
  }, []);

  // Handle incoming SSE messages (leader only)
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as UserStreamMessage;
        const eventId = event.lastEventId || undefined;

        // Broadcast to follower tabs
        broadcastStreamMessage(message, 'user');

        // Process locally (handles hydrate barrier internally)
        processMessage(message, eventId);
      } catch (error) {
        console.debug('[useUserStream] Failed to parse message:', error);
      }
    },
    [processMessage],
  );

  // Handle offset event (end of catch-up)
  const handleOffset = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as UserStreamOffsetEvent;
      setCursor(data.cursor);
      onCatchUpCompleteRef.current?.(data.cursor);
    } catch (error) {
      console.debug('[useUserStream] Failed to parse offset event:', error);
    }
  }, []);

  // Store handlers in refs for SSE connection
  const handleMessageRef = useRef(handleMessage);
  const handleOffsetRef = useRef(handleOffset);
  handleMessageRef.current = handleMessage;
  handleOffsetRef.current = handleOffset;

  // SSE connection management
  const { state, eventSourceRef, connect, disconnect, reconnect } = useSSEConnection({
    url: `${API_BASE}/me/stream`,
    enabled,
    withCredentials: true,
    initialOffset,
    handlers: {
      change: (e) => handleMessageRef.current(e),
      offset: (e) => handleOffsetRef.current(e),
    },
    onStateChange,
    debugLabel: 'useUserStream',
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
        processMessage(message);
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
  useLeaderReconnect({ enabled, isLeaderTab, reconnect, debugLabel: 'useUserStream' });

  // Reconnect on visibility change (tab becomes visible)
  useVisibilityReconnect({ reconnect, eventSourceRef, debugLabel: 'useUserStream' });

  return {
    state,
    cursor,
    reconnect,
    disconnect,
  };
}
