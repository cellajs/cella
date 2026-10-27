import { useEffect } from 'react';
import { useStore } from 'zustand';
import { appStreamManager } from '~/query/realtime/stream-store';
import { runSyncService } from '~/query/realtime/sync-service';

const debugLabel = 'AppStream';

/** Connects the app stream and seeds offline caches once it is live; StreamManager owns every reconnect, visibility and leader changes included. Mount in AppLayout. */
export function AppStream() {
  // Only the connection state: the cursor advances on every event and nothing here renders it.
  const streamState = useStore(appStreamManager.store, (state) => state.state);

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
    runSyncService(controller.signal).catch((error) => {
      if (!controller.signal.aborted) console.debug(`[${debugLabel}] Sync service error:`, error);
    });
    return () => controller.abort();
  }, [streamState]);

  return null;
}
