import { useEffect } from 'react';
import { appConfig } from 'shared';
import { setupSeenBeaconFlush, useSeenStore } from '~/store/seen';
import { useTotalUnseenCount } from './use-unseen-count';

/**
 * Invisible component that initializes the seen-tracking system.
 * - Starts the periodic flush interval (1 min).
 * - Registers sendBeacon flush on page unload.
 * - Syncs the PWA app badge with the total unseen count.
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

  // Sync PWA app badge with total unseen count
  useAppBadge();

  return null;
}

/**
 * Keeps the PWA app badge count in sync with the total unseen count.
 * Works on installed PWAs (Chrome, Edge, Safari iOS 16.4+).
 * Falls back gracefully when the Badging API is unavailable.
 */
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

/**
 * Registers periodic background sync so the service worker can update the
 * app badge even when the app is closed. Chromium-only (Chrome 80+, Edge).
 * Silently no-ops on unsupported browsers.
 */
async function registerPeriodicBadgeSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration || !('periodicSync' in registration)) return;

    // Check if permission is granted
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return;

    await (registration as any).periodicSync.register('unseen-badge-sync', {
      minInterval: 60 * 60 * 1000, // Hint: 1 hour (browser decides actual interval)
    });
  } catch {
    // Unsupported or permission denied — silently ignore
  }
}
