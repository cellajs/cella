import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { appConfig } from 'shared';
import { notificationsQueryOptions } from '~/modules/notification/query';
import { seenStore, setupSeenBeaconFlush } from '~/modules/seen/seen-store';

declare global {
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

/** The PWA badge shows unread notifications: unseen counts rarely reach zero in an active channel, so a badge lit by them gets ignored. */
function useAppBadge() {
  const { data } = useQuery(notificationsQueryOptions());
  const unreadCount = data?.unreadCount ?? 0;

  useEffect(() => {
    if (!('setAppBadge' in navigator)) return;

    // Rejects where the badge permission is missing (the notification permission on iOS).
    if (unreadCount > 0) void navigator.setAppBadge(unreadCount).catch(() => {});
    else void navigator.clearAppBadge().catch(() => {});
  }, [unreadCount]);
}
