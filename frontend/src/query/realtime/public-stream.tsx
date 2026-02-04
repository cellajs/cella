import { appConfig } from 'config';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicStreamActivity } from '~/api.gen';
import { publicStream } from '~/api.gen';
import { useLatestRef } from '~/hooks/use-latest-ref';
import { pageQueryKeys } from '~/modules/page/query';
import { queryClient } from '~/query/query-client';
import { handlePublicStreamMessage } from './public-stream-handler';
import type { StreamState, UsePublicStreamOptions, UsePublicStreamReturn } from './types';
import { useSSEConnection } from './use-sse-connection';
import { useVisibilityReconnect } from './use-visibility-reconnect';

const debugLabel = 'PublicStream';

/** Store cursor (activity ID) for catch-up on reconnect */
let lastCursor: string | null = null;

/**
 * Fetch delete catch-up activities as JSON batch (not SSE).
 * Returns delete activities and cursor for subsequent SSE connection.
 */
async function fetchDeleteCatchup(
  offset: string | null,
): Promise<{ activities: PublicStreamActivity[]; cursor: string | null }> {
  const response = await publicStream({
    query: { offset: offset ?? undefined },
    // Note: no 'live' param = JSON batch response
  });

  return {
    activities: (response.activities ?? []) as PublicStreamActivity[],
    cursor: response.cursor ?? null,
  };
}

/**
 * Hook to sync public pages via live stream.
 * No tab coordination - each tab maintains its own connection.
 * Public streams are cheap (no auth, cacheable at edge).
 *
 * Flow:
 * 1. Poll: Fetch delete catch-up as JSON batch
 * 2. Process: Remove deleted pages from cache
 * 3. SSE: Connect with offset=now for live-only updates
 * 4. Invalidate list for modifiedAfter refetch of create/updates
 */
export function usePublicStream(options: UsePublicStreamOptions = {}): UsePublicStreamReturn {
  const { enabled = true, onStateChange } = options;

  const [state, setState] = useState<StreamState>('disconnected');
  const [cursor, setCursor] = useState<string | null>(lastCursor);
  const eventSourceRef = useRef<EventSource | null>(null);
  const catchupCompleteRef = useRef(false);
  const initializingRef = useRef(false);
  const isReconnectRef = useRef(lastCursor !== null);

  // Store callback in ref
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;

  // Update state and notify callback
  const updateState = useCallback((newState: StreamState) => {
    setState(newState);
    onStateChangeRef.current?.(newState);
  }, []);

  // Process a notification
  const processMessage = useCallback((message: PublicStreamActivity) => {
    handlePublicStreamMessage(message);
  }, []);

  // Handle incoming SSE notifications
  const handleSSENotification = useCallback(
    (event: MessageEvent) => {
      try {
        const message = JSON.parse(event.data) as PublicStreamActivity;
        processMessage(message);
      } catch (error) {
        console.debug(`[${debugLabel}] Failed to parse message:`, error);
      }
    },
    [processMessage],
  );

  // Handle SSE offset event (signals ready for live events)
  const handleSSEOffset = useCallback(
    (event: MessageEvent) => {
      const offsetData = event.data;
      console.debug(`[${debugLabel}] SSE offset received: ${offsetData}`);
      if (offsetData) {
        lastCursor = offsetData;
        setCursor(offsetData);
      }
      updateState('live');
    },
    [updateState],
  );

  // Store handlers in refs for SSE connection
  const handleSSENotificationRef = useLatestRef(handleSSENotification);
  const handleSSEOffsetRef = useLatestRef(handleSSEOffset);

  // SSE connection for live-only (after catchup completes)
  // No tab coordination for public streams - each tab connects independently
  const {
    eventSourceRef: sseEventSourceRef,
    connect: sseConnect,
    disconnect: sseDisconnect,
  } = useSSEConnection({
    url: `${appConfig.backendUrl}/entities/public/stream`,
    enabled,
    withCredentials: false,
    requireLeader: false, // Public streams don't use tab coordination
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
      console.debug(
        `[${debugLabel}] Skipping initialize (already ${initializingRef.current ? 'in progress' : 'complete'})`,
      );
      return;
    }

    initializingRef.current = true;

    try {
      updateState('catching-up');
      console.debug(`[${debugLabel}] Fetching delete catchup from offset: ${lastCursor ?? 'null'}`);

      // Phase 1: Fetch delete catchup as JSON batch
      const { activities, cursor: newCursor } = await fetchDeleteCatchup(lastCursor);

      // Process delete activities
      if (activities.length > 0) {
        console.debug(`[${debugLabel}] Processing ${activities.length} delete activities`);
        for (const activity of activities) {
          processMessage(activity);
        }
      }

      // Update cursor
      if (newCursor) {
        lastCursor = newCursor;
        setCursor(newCursor);
      }

      // Invalidate list to trigger modifiedAfter refetch for create/updates
      if (isReconnectRef.current) {
        console.debug(`[${debugLabel}] Invalidating list for modifiedAfter refetch`);
        queryClient.invalidateQueries({ queryKey: pageQueryKeys.list.base });
      }

      catchupCompleteRef.current = true;
      isReconnectRef.current = true;
      console.debug(`[${debugLabel}] Catchup complete, cursor: ${newCursor}`);

      // Phase 2: Connect SSE for live updates
      sseConnect();
    } catch (error) {
      console.error(`[${debugLabel}] Catchup failed:`, error);
      updateState('error');
    } finally {
      initializingRef.current = false;
    }
  }, [updateState, sseConnect, processMessage]);

  // Manual reconnect (disconnect + reinitialize)
  const reconnect = useCallback(() => {
    sseDisconnect();
    catchupCompleteRef.current = false;
    initializingRef.current = false;
    initialize();
  }, [sseDisconnect, initialize]);

  // Start two-phase connection (no tab coordination for public streams)
  useEffect(() => {
    if (!enabled) return;

    initialize();

    return () => {
      sseDisconnect();
      catchupCompleteRef.current = false;
      initializingRef.current = false;
    };
  }, [enabled, initialize, sseDisconnect]);

  // Reconnect on visibility change (tab becomes visible)
  useVisibilityReconnect({ reconnect, eventSourceRef, requireLeader: false, debugLabel });

  return { state, cursor, reconnect, disconnect: sseDisconnect };
}

/**
 * Component that connects to the public stream for real-time updates.
 * Syncs public entities (e.g., pages) via the `/entities/public/stream` endpoint.
 * No tab coordination - each tab maintains its own connection.
 */
export default function PublicStream() {
  usePublicStream({
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
