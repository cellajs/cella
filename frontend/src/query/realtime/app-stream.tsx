import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { handleAppStreamMessage } from './app-stream-handler';
import type {
  AppStreamMessage,
  AppStreamOffsetEvent,
  UseAppStreamOptions,
  UseAppStreamReturn,
} from './app-stream-types';
import { createHydrateBarrier } from './hydrate-barrier';
import {
  broadcastNotification,
  initTabCoordinator,
  isLeader,
  onNotification,
  useTabCoordinatorStore,
} from './tab-coordinator';
import { useLeaderReconnect } from './use-leader-reconnect';
import { useSSEConnection } from './use-sse-connection';
import { useVisibilityReconnect } from './use-visibility-reconnect';

const debugLabel = 'AppStream';

/**
 * Hook to connect to the app-scoped stream SSE endpoint.
 * Handles realtime entity and membership events for the current user.
 *
 * Uses tab coordination to ensure only one tab maintains the SSE connection:
 * - Leader tab: Opens SSE, broadcasts notifications to followers via BroadcastChannel
 * - Follower tabs: Receive notifications via broadcast, no SSE connection
 *
 * This prevents redundant IDB writes when cache is persisted across tabs.
 */
export function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const {
    enabled = true,
    initialOffset = 'now',
    onMessage,
    onCatchUpComplete,
    onStateChange,
    isHydrated = true,
  } = options;

  const [cursor, setCursor] = useState<string | null>(null);
  const isLeaderTab = useTabCoordinatorStore((state) => state.isLeader);
  const broadcastCleanupRef = useRef<(() => void) | null>(null);

  // Store callbacks in refs to avoid recreating handlers on every render
  const onMessageRef = useLatestRef(onMessage);
  const onCatchUpCompleteRef = useLatestRef(onCatchUpComplete);

  // Hydrate barrier: queue notifications until initial queries complete
  const barrierRef = useRef(createHydrateBarrier<{ message: AppStreamMessage; eventId?: string }>());

  // Flush queued notifications when hydration completes
  useEffect(() => {
    if (isHydrated) {
      const queued = barrierRef.current.complete();
      for (const { message, eventId } of queued) {
        if (eventId) setCursor(eventId);
        onMessageRef.current?.(message);
      }
    }
  }, [isHydrated]);

  // Process a notification (used by both leader and followers)
  const processMessage = useCallback((message: AppStreamMessage, eventId?: string) => {
    if (barrierRef.current.enqueue({ message, eventId })) {
      console.debug(`[${debugLabel}] Queued notification during hydration:`, message.entityType, message.action);
      return;
    }
    if (eventId) setCursor(eventId);
    onMessageRef.current?.(message);
  }, []);

  // Handle incoming SSE notifications (leader only)
  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as AppStreamMessage;
        const eventId = event.lastEventId || undefined;
        broadcastNotification(message, 'user');
        processMessage(message, eventId);
      } catch (error) {
        console.debug(`[${debugLabel}] Failed to parse notification:`, error);
      }
    },
    [processMessage],
  );

  // Handle offset event (end of catch-up)
  const handleOffset = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data) as AppStreamOffsetEvent;
      setCursor(data.cursor);
      onCatchUpCompleteRef.current?.(data.cursor);
    } catch (error) {
      console.debug(`[${debugLabel}] Failed to parse offset event:`, error);
    }
  }, []);

  // Store handlers in refs for SSE connection
  const handleMessageRef = useLatestRef(handleMessage);
  const handleOffsetRef = useLatestRef(handleOffset);

  // SSE connection management
  const { state, eventSourceRef, connect, disconnect, reconnect } = useSSEConnection({
    url: `${appConfig.backendUrl}/me/stream`,
    enabled,
    withCredentials: true,
    initialOffset,
    handlers: {
      change: (e) => handleMessageRef.current(e),
      offset: (e) => handleOffsetRef.current(e),
    },
    onStateChange,
    debugLabel,
  });

  // Initialize tab coordinator and connect
  useEffect(() => {
    if (!enabled) return;

    let cleanup = false;

    initTabCoordinator().then(() => {
      if (cleanup) return;

      // Listen for broadcast notifications from leader (follower tabs)
      broadcastCleanupRef.current = onNotification((notification) => {
        if (!isLeader()) processMessage(notification);
      });

      connect();
    });

    return () => {
      cleanup = true;
      disconnect();
      broadcastCleanupRef.current?.();
      broadcastCleanupRef.current = null;
    };
  }, [enabled, connect, disconnect, processMessage]);

  // Reconnect when becoming leader
  useLeaderReconnect({ enabled, isLeaderTab, reconnect, debugLabel });

  // Reconnect on visibility change (tab becomes visible)
  useVisibilityReconnect({ reconnect, eventSourceRef, debugLabel });

  return { state, cursor, reconnect, disconnect };
}

/**
 * Component that connects to the app-scoped stream for real-time updates.
 * Handles membership, organization, and product entity events via CDC → ActivityBus pipeline.
 * Use in AppLayout for app-wide real-time sync.
 */
export default function AppStream() {
  useAppStream({
    onMessage: handleAppStreamMessage,
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
