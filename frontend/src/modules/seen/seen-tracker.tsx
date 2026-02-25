import { useEffect } from 'react';
import { appConfig } from 'shared';
import { setupSeenBeaconFlush, useSeenStore } from '~/store/seen';

/**
 * Invisible component that initializes the seen-tracking system.
 * - Starts the periodic flush interval (1 min).
 * - Registers sendBeacon flush on page unload.
 * - Cleans up on unmount.
 *
 * Mount once in the app layout.
 */
export function SeenTracker() {
  useEffect(() => {
    const { startFlushInterval, stopFlushInterval, flush } = useSeenStore.getState();
    startFlushInterval();
    const cleanupBeacon = setupSeenBeaconFlush();

    const isDev = appConfig.mode === 'development';

    // Expose manual flush in dev for debugging
    if (isDev) {
      (window as any).__flushSeen = flush;
      console.debug('[SeenTracker] initialized — call window.__flushSeen() to flush manually');
    }

    return () => {
      stopFlushInterval();
      cleanupBeacon();
      if (isDev) {
        delete (window as any).__flushSeen;
      }
    };
  }, []);

  return null;
}
