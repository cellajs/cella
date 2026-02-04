import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getAppStream } from '~/api.gen';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { useSyncStore } from '~/store/sync';
import { handleAppStreamNotification } from './app-stream-handler';
import type { AppStreamNotification, StreamState, UseAppStreamOptions, UseAppStreamReturn } from './types';
import { processCatchupBatch } from './catchup-processor';
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
 * Fetch catchup activities as JSON batch (not SSE).
 * Returns activities and cursor for subsequent SSE connection.
 */
async function fetchCatchup(
  offset: string | null,
): Promise<{ activities: AppStreamNotification[]; cursor: string | null }> {
  const response = await getAppStream({
    query: { offset: offset ?? undefined },
    // Note: no 'live' param = JSON batch response
  });

  return {
    activities: (response.activities ?? []) as AppStreamNotification[],
    cursor: response.cursor ?? null,
  };
}

/**
 * Hook to connect to the app-scoped stream for real-time updates.
 *
 * Two-phase approach:
 * 1. Fetch catchup as JSON batch → process with batch processor
 * 2. Connect SSE with cursor for live-only updates
 *
 * Uses tab coordination to ensure only one tab maintains the SSE connection:
 * - Leader tab: Opens SSE, broadcasts notifications to followers via BroadcastChannel
 * - Follower tabs: Receive notifications via broadcast, no SSE connection
 */
export function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const { enabled = true, onNotification: onNotificationCallback, onCatchUpComplete, onStateChange } = options;

  const [state, setState] = useState<StreamState>('disconnected');
  const [cursor, setCursor] = useState<string | null>(null);
  const isLeaderTab = useTabCoordinatorStore((state) => state.isLeader);
  const broadcastCleanupRef = useRef<(() => void) | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const catchupCompleteRef = useRef(false);
  const initializingRef = useRef(false);

  // Get sync store state and actions
  const syncCursor = useSyncStore((state) => state.cursor);
  const lastSyncAt = useSyncStore((state) => state.lastSyncAt);
  const setSyncCursor = useSyncStore((state) => state.setCursor);
  const setLastSyncAt = useSyncStore((state) => state.setLastSyncAt);

  // Store callbacks in refs
  const onNotificationRef = useLatestRef(onNotificationCallback);
  const onCatchUpCompleteRef = useLatestRef(onCatchUpComplete);
  const onStateChangeRef = useLatestRef(onStateChange);

  // Store sync values in refs to prevent initialize from being recreated
  const syncCursorRef = useLatestRef(syncCursor);
  const lastSyncAtRef = useLatestRef(lastSyncAt);

  // Update state and notify callback
  const updateState = useCallback((newState: StreamState) => {
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  // Process a live notification (used by both leader and followers)
  const processNotification = useCallback((notification: AppStreamNotification, eventId?: string) => {
    if (eventId) setCursor(eventId);
    onNotificationRef.current?.(notification);
  }, []);

  // Handle incoming SSE notifications (leader only - live events only, no catchup)
  const handleSSENotification = useCallback(
    (event: MessageEvent) => {
      try {
        const notification = JSON.parse(event.data) as AppStreamNotification;
        const eventId = event.lastEventId || undefined;

        // Update cursor and persist
        if (eventId) {
          setCursor(eventId);
          setSyncCursor(eventId);
        }

        // Broadcast to follower tabs
        broadcastNotification(notification, 'user');

        // Process the notification
        onNotificationRef.current?.(notification);
      } catch (error) {
        console.debug(`[${debugLabel}] Failed to parse notification:`, error);
      }
    },
    [setSyncCursor],
  );

  // Handle SSE offset event (signals ready for live events)
  const handleSSEOffset = useCallback(
    (event: MessageEvent) => {
      const offsetData = event.data;
      console.debug(`[${debugLabel}] SSE offset received: ${offsetData}`);
      if (offsetData) {
        setCursor(offsetData);
        setSyncCursor(offsetData);
      }
      updateState('live');
    },
    [setSyncCursor, updateState],
  );

  // Store handlers in refs for SSE connection
  const handleSSENotificationRef = useLatestRef(handleSSENotification);
  const handleSSEOffsetRef = useLatestRef(handleSSEOffset);

  // SSE connection for live-only (after catchup completes)
  const {
    state: sseState,
    eventSourceRef: sseEventSourceRef,
    connect: sseConnect,
    disconnect: sseDisconnect,
  } = useSSEConnection({
    url: `${appConfig.backendUrl}/me/stream`,
    enabled, // Pass through for potential future auto-connect or state tracking
    withCredentials: true,
    getOffset: () => 'now', // Always 'now' since we already did catchup
    handlers: {
      change: (e) => handleSSENotificationRef.current(e),
      offset: (e) => handleSSEOffsetRef.current(e),
    },
    onStateChange: updateState,
    debugLabel,
  });

  // Keep eventSourceRef in sync
  useEffect(() => {
    eventSourceRef.current = sseEventSourceRef.current;
  }, [sseEventSourceRef.current]);

  // Two-phase initialization: catchup (JSON) → live (SSE)
  const initialize = useCallback(async () => {
    // Prevent duplicate initialization
    if (initializingRef.current || catchupCompleteRef.current) {
      console.debug(`[${debugLabel}] Skipping initialize (already ${initializingRef.current ? 'in progress' : 'complete'})`);
      return;
    }

    if (!isLeader()) {
      console.debug(`[${debugLabel}] Not leader, listening to broadcasts only`);
      updateState('live');
      return;
    }

    initializingRef.current = true;

    // Read current values from refs to avoid stale closures
    const currentSyncCursor = syncCursorRef.current;
    const currentLastSyncAt = lastSyncAtRef.current;

    try {
      updateState('catching-up');
      console.debug(`[${debugLabel}] Fetching catchup from offset: ${currentSyncCursor ?? 'null'}`);

      // Phase 1: Fetch catchup as JSON batch
      const { activities, cursor: newCursor } = await fetchCatchup(currentSyncCursor);

      if (activities.length > 0) {
        console.debug(`[${debugLabel}] Processing ${activities.length} catchup activities`);
        processCatchupBatch(activities, { lastSyncAt: currentLastSyncAt });
      }

      // Update cursor
      if (newCursor) {
        setCursor(newCursor);
        setSyncCursor(newCursor);
        setLastSyncAt(new Date().toISOString());
      }

      catchupCompleteRef.current = true;
      onCatchUpCompleteRef.current?.(newCursor);
      console.debug(`[${debugLabel}] Catchup complete, cursor: ${newCursor}`);

      // Phase 2: Connect SSE for live updates
      sseConnect();
    } catch (error) {
      console.error(`[${debugLabel}] Catchup failed:`, error);
      updateState('error');
    } finally {
      initializingRef.current = false;
    }
  }, [setSyncCursor, setLastSyncAt, updateState, sseConnect]);

  // Initialize tab coordinator and start two-phase connection
  useEffect(() => {
    if (!enabled) return;

    let cleanup = false;

    initTabCoordinator().then(() => {
      if (cleanup) return;

      // Listen for broadcast notifications from leader (follower tabs)
      broadcastCleanupRef.current = onNotification((notification) => {
        if (!isLeader()) processNotification(notification);
      });

      initialize();
    });

    return () => {
      cleanup = true;
      sseDisconnect();
      broadcastCleanupRef.current?.();
      broadcastCleanupRef.current = null;
      catchupCompleteRef.current = false;
      initializingRef.current = false;
    };
  }, [enabled, initialize, sseDisconnect, processNotification]);

  // Reconnect when becoming leader
  useLeaderReconnect({ enabled, isLeaderTab, reconnect: initialize, debugLabel });

  // Reconnect on visibility change
  useVisibilityReconnect({ reconnect: initialize, eventSourceRef, debugLabel });

  return {
    state: sseState === 'disconnected' ? state : sseState,
    cursor,
    reconnect: initialize,
    disconnect: sseDisconnect,
  };
}

/**
 * Component that connects to the app-scoped stream for real-time updates.
 * Handles membership, organization, and product entity events via CDC → ActivityBus pipeline.
 * Use in AppLayout for app-wide real-time sync.
 */
export default function AppStream() {
  useAppStream({
    onNotification: handleAppStreamNotification,
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
