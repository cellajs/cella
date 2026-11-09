import { useEffect } from 'react';
import { useStore } from 'zustand';
import { streamManager } from '~/query/realtime/stream-manager';
import { runSyncService } from '~/query/realtime/sync-service';

const debugLabel = 'StreamSync';

/** Seeds offline caches once the stream is live: the app route's `beforeLoad` connects it, and StreamManager owns every reconnect. Mount in AppLayout. */
export function StreamSync() {
  const streamState = useStore(streamManager.store, (state) => state.state);

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
