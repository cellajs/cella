import { useEffect, useRef } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from './stream-store';
import { runSyncService } from './sync-service';
import type { UseAppStreamOptions, UseAppStreamReturn } from './types';

const debugLabel = 'AppStream';

/** React wrapper around appStreamManager. StreamManager owns all reconnect logic, including visibility and leader changes. */
function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const { enabled = true } = options;

  const state = appStreamManager.useStore((s) => s.state);
  const cursor = appStreamManager.useStore((s) => s.cursor);

  // Route beforeLoad owns the disconnect lifecycle.
  useEffect(() => {
    if (enabled) {
      appStreamManager.connect();
    } else {
      appStreamManager.disconnect();
    }
  }, [enabled]);

  useEffect(() => {
    if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [state]);

  const syncAbortRef = useRef<AbortController | null>(null);
  const offlineAccess = useUIStore((s) => s.offlineAccess);

  useEffect(() => {
    // Abort the previous sync run on re-trigger or cleanup.
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

/** Connects to the app-scoped stream for real-time sync (CDC -> ActivityBus pipeline). Mount in AppLayout. */
export function AppStream() {
  useAppStream();
  return null;
}
