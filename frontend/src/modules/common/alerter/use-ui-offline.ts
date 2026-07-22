import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { revalidateConnectivity } from '~/query/offline/connectivity';

// Sustained-offline duration required before surfacing the UI toast.
const showDelay = 2000;

/**
 * Delay offline UI until disconnection persists, clear immediately on reconnect, and probe on resume.
 * Query pausing still follows `onlineManager` without delay.
 */
export const useUiOffline = () => {
  const isOnline = useOnlineManager();

  // Debounced derivation: surface offline only after sustained disconnection; clear instantly.
  useEffect(() => {
    const { downAlert, setDownAlert } = useAlertStore.getState();

    if (isOnline) {
      if (downAlert === 'offline') setDownAlert(null);
      return;
    }

    const timer = setTimeout(() => useAlertStore.getState().setDownAlert('offline'), showDelay);
    return () => clearTimeout(timer);
  }, [isOnline]);

  // On returning to a backgrounded/frozen tab, re-verify connectivity so a stale offline
  // state clears as soon as the network is actually back (don't wait for the laggy 'online' event).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (onlineManager.isOnline()) return; // not offline, nothing stale to clear
      revalidateConnectivity();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
};
