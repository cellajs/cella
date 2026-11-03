import { useEffect } from 'react';
import { useStore } from 'zustand';
import { appStreamManager } from '~/query/realtime/stream-manager';
import { runSyncService } from '~/query/realtime/sync-service';

const debugLabel = 'AppStream';

/** Seeds offline caches once the app stream is live: the app route's `beforeLoad` connects it, and StreamManager owns every reconnect. Mount in AppLayout. */
export function AppStream() {
  // Only the connection state: the cursor advances on every event and nothing here renders it.
  const streamState = useStore(appStreamManager.store, (state) => state.state);

  useEffect(() => {
    if (streamState === 'live') console.debug(`[${debugLabel}] Connected and live`);
    if (streamState === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
  }, [streamState]);

  // The cleanup aborts this sync run on re-trigger or unmount.
  useEffect(() => {
    if (streamState !== 'live') return;
    const controller = new AbortController();
    runSyncService(controller.signal).catch((error) => {
      if (!controller.signal.aborted) console.debug(`[${debugLabel}] Sync service error:`, error);
    });
    return () => controller.abort();
  }, [streamState]);

  return null;
}
