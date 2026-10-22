import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { alertStore } from '~/modules/common/alerter/alert-store';
import { revalidateConnectivity } from '~/query/offline/connectivity';

// How long the connection must stay lost before the offline alert shows (ms).
const showDelay = 2000;

/**
 * Delay offline UI until disconnection persists, clear immediately on reconnect, and probe on resume.
 * Query pausing still follows `onlineManager` without delay.
 */
export const useUIOffline = () => {
  const isOnline = useOnlineManager();

  useEffect(() => {
    const { downAlert, setDownAlert } = alertStore.getState();

    if (isOnline) {
      if (downAlert === 'offline') setDownAlert(null);
      return;
    }

    const timer = setTimeout(() => alertStore.getState().setDownAlert('offline'), showDelay);
    return () => clearTimeout(timer);
  }, [isOnline]);

  // Re-verify on tab resume: the 'online' event lags, leaving a stale offline state
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (onlineManager.isOnline()) return;
      revalidateConnectivity();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
};
