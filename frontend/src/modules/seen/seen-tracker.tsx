import { useEffect } from 'react';
import { appConfig } from 'shared';
import { setupSeenBeaconFlush, useSeenStore } from '~/modules/seen/seen-store';
import { useTotalUnseenCount } from './use-unseen-count';

// Periodic Background Sync API (Chromium-only) and dev-only window helper.
interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
}
declare global {
  interface ServiceWorkerRegistration {
    readonly periodicSync?: PeriodicSyncManager;
  }
  interface Window {
    __flushSeen?: () => void;
  }
}

/** Invisible component that boots seen-tracking (flush interval, unload beacon, PWA badge sync). Mount once in the app layout. */
export function SeenTracker() {
  useEffect(() => {
    const { startFlushInterval, stopFlushInterval, flush } = useSeenStore.getState();
    startFlushInterval();
    const cleanupBeacon = setupSeenBeaconFlush();

    const isDev = appConfig.mode === 'development';

    // Expose manual flush in dev for debugging
    if (isDev) {
      window.__flushSeen = flush;
      console.debug('[SeenTracker] initialized — call window.__flushSeen() to flush manually');
    }

    return () => {
      stopFlushInterval();
      cleanupBeacon();
      if (isDev) {
        delete window.__flushSeen;
      }
    };
  }, []);

  // Sync PWA app badge with total unseen count
  useAppBadge();

  return null;
}

/** Syncs the PWA app badge with total unseen count. Badging API only (Chrome/Edge/Safari iOS 16.4+); no-ops elsewhere. */
function useAppBadge() {
  const total = useTotalUnseenCount();

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;

    if (total > 0) {
      navigator.setAppBadge(total);
    } else {
      navigator.clearAppBadge();
    }
  }, [total]);

  // Register periodic background sync for badge updates when app is closed (Chromium only)
  useEffect(() => {
    registerPeriodicBadgeSync();
  }, []);
}

/** Registers periodic background sync so the service worker updates the badge while the app is closed. Chromium-only (Chrome 80+, Edge); no-ops elsewhere. */
async function registerPeriodicBadgeSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration?.periodicSync) return;

    // Check if permission is granted
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return;

    await registration.periodicSync.register('unseen-badge-sync', {
      minInterval: 60 * 60 * 1000, // Hint: 1 hour (browser decides actual interval)
    });
  } catch {
    // Unsupported or permission denied.
  }
}
