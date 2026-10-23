import { useEffect } from 'react';
import { useUIStore } from '~/modules/ui/ui-store';
import { appStreamManager } from './stream-store';
import { runSyncService } from './sync-service';

const debugLabel = 'AppStream';

/** Connects to the app-scoped stream for real-time sync (CDC -> ActivityBus pipeline). StreamManager owns all reconnect logic, including visibility and leader changes. Mount in AppLayout. */
export function AppStream() {
  // Only the connection state: the cursor advances on every event and nothing here renders it.
  const state = appStreamManager.useStore((s) => s.state);
  const offlineAccess = useUIStore((s) => s.offlineAccess);

  // Route beforeLoad owns the disconnect lifecycle.
  useEffect(() => {
    appStreamManager.connect();
  }, []);

  useEffect(() => {
    if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [state]);

  // The cleanup aborts this sync run on re-trigger or unmount.
  useEffect(() => {
    if (state !== 'live') return;
    const controller = new AbortController();
    runSyncService(offlineAccess, controller.signal).catch((err) => {
      if (!controller.signal.aborted) console.debug(`[${debugLabel}] Sync service error:`, err);
    });
    return () => controller.abort();
  }, [state, offlineAccess]);

  return null;
}
