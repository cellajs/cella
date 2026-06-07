import { onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { useAlertStore } from '~/modules/common/alerter/alert-store';
import { revalidateConnectivity } from '~/query/offline/connectivity';

// Sustained-offline duration required before surfacing the UI toast.
const showDelay = 2000;

/**
 * Derives the *UI* offline state from the *logic* offline state (`onlineManager`).
 *
 * `onlineManager` is the single source of truth for connectivity (driven by the /health
 * probe). It reacts instantly — ideal for pausing queries/mutations, but unsuitable for UI,
 * since a transient blip would flash a toast. This hook is a low-pass filter over that signal:
 *
 * - logic offline → UI offline: only after `showDelay` of *sustained* disconnection (debounced)
 * - logic online → UI offline cleared: immediately
 * - on tab resume while offline: re-verify with a real request, since mobile's 'online' event
 *   is laggy and the pre-freeze offline state may be stale
 *
 * UI offline is therefore always a function of logic offline + time — never an independent
 * state — so the two layers cannot desync.
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
      if (onlineManager.isOnline()) return; // not offline — nothing stale to clear
      revalidateConnectivity();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
};
