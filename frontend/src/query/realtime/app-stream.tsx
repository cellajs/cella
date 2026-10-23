import { useEffect } from 'react';
import { useStore } from 'zustand';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from './stream-store';
import { runSyncService } from './sync-service';

const debugLabel = 'AppStream';

/** Connects to the app-scoped stream for real-time sync (CDC -> ActivityBus pipeline). StreamManager owns all reconnect logic, including visibility and leader changes. Mount in AppLayout. */
export function AppStream() {
  // Only the connection state: the cursor advances on every event and nothing here renders it.
  const streamState = useStore(appStreamManager.store, (state) => state.state);
  const offlineAccess = useUIStore((state) => state.offlineAccess);

  // Route beforeLoad owns the disconnect lifecycle.
  useEffect(() => {
    appStreamManager.connect();
  }, []);

  useEffect(() => {
    if (streamState === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (streamState === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [streamState]);

  // The cleanup aborts this sync run on re-trigger or unmount.
  useEffect(() => {
    if (streamState !== 'live') return;
    const controller = new AbortController();
    runSyncService(offlineAccess, controller.signal).catch((error) => {
      if (!controller.signal.aborted) console.debug(`[${debugLabel}] Sync service error:`, error);
    });
    return () => controller.abort();
  }, [streamState, offlineAccess]);

  return null;
}
