import { useEffect, useRef } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from './stream-store';
import { runSyncService } from './sync-service';
import type { UseAppStreamOptions, UseAppStreamReturn } from './types';

const debugLabel = 'AppStream';

/**
 * Thin React wrapper around appStreamManager for real-time updates.
 * All reconnect logic (visibility, leader changes) is handled by StreamManager.
 */
function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const { enabled = true } = options;

  const state = appStreamManager.useStore((s) => s.state);
  const cursor = appStreamManager.useStore((s) => s.cursor);

  // Connect based on enabled prop (disconnect lifecycle managed by route beforeLoad)
  useEffect(() => {
    if (enabled) {
      appStreamManager.connect();
    } else {
      appStreamManager.disconnect();
    }
  }, [enabled]);

  // Debug log state transitions
  useEffect(() => {
    if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [state]);

  // Run sync service when stream goes live
  const syncAbortRef = useRef<AbortController | null>(null);
  const offlineAccess = useUIStore((s) => s.offlineAccess);

  useEffect(() => {
    // Abort previous sync run on re-trigger or cleanup
    syncAbortRef.current?.abort();

    if (state === 'live') {
      const controller = new AbortController();
      syncAbortRef.current = controller;
      runSyncService(offlineAccess, controller.signal).catch((err) => {
        if (!controller.signal.aborted) console.debug(`[${debugLabel}] Sync service error:`, err);
      });
    }

    return () => {
      syncAbortRef.current?.abort();
    };
  }, [state, offlineAccess]);

  return {
    state,
    cursor,
    reconnect: () => appStreamManager.reconnect(),
    disconnect: () => appStreamManager.disconnect(),
  };
}

/**
 * Component that connects to the app-scoped stream for real-time updates.
 * Handles membership, organization, and product entity events via CDC -> ActivityBus pipeline.
 * Use in AppLayout for app-wide real-time sync.
 */
export function AppStream() {
  useAppStream();
  return null;
}
