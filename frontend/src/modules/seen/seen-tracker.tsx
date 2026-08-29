import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { notificationsQueryOptions } from '~/modules/notification/query';
import { seenStore, setupSeenBeaconFlush } from '~/modules/seen/seen-store';

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
    const { startFlushInterval, stopFlushInterval, flush } = seenStore.getState();
    startFlushInterval();
    const cleanupBeacon = setupSeenBeaconFlush();

    const isDev = appConfig.mode === 'development';

    if (isDev) {
      window.__flushSeen = flush;
      console.debug('[SeenTracker] initialized, call window.__flushSeen() to flush manually');
    }

    return () => {
      stopFlushInterval();
      cleanupBeacon();
      if (isDev) {
        delete window.__flushSeen;
      }
    };
  }, []);

  useAppBadge();

  return null;
}

/**
 * Syncs the PWA app badge with the unread NOTIFICATION count, not the unseen total: unseen counts
 * effectively never reach zero in an active channel, and a permanently lit badge is one users
 * learn to ignore, while unread notifications are addressed to you and clear by reading. Unseen
 * counts stay on the in-app menu badges. Badging API only (Chrome/Edge/Safari iOS 16.4+).
 */
function useAppBadge() {
  const { data } = useQuery(notificationsQueryOptions());
  const total = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;

    if (total > 0) {
      navigator.setAppBadge(total);
    } else {
      navigator.clearAppBadge();
    }
  }, [total]);

  useEffect(() => {
    registerPeriodicBadgeSync();
  }, []);
}

/** Lets the service worker update the badge while the app is closed. Chromium-only (Chrome 80+, Edge); no-ops elsewhere. */
async function registerPeriodicBadgeSync() {
  try {
    const registration = await navigator.serviceWorker?.ready;
    if (!registration?.periodicSync) return;

    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return;

    await registration.periodicSync.register('unseen-badge-sync', {
      minInterval: 60 * 60 * 1000, // Hint: 1 hour (browser decides actual interval)
    });
  } catch {
    // Unsupported or permission denied.
  }
}
