import { useCallback, useEffect, useState } from 'react';
import { appConfig } from 'shared';
import { fetchPushVapid, registerPushSubscription, removePushSubscription } from '~/modules/notification/query';

/** `applicationServerKey` wants raw bytes; VAPID keys travel base64url-encoded. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

const pushSupported = () =>
  appConfig.has.push &&
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

/**
 * Web Push subscription state for this browser installation, driving the settings toggle.
 * `supported` is false when the config flag is off, the browser lacks the APIs, or the deployment
 * serves no VAPID key; `enable` runs the permission prompt, so call it from a user gesture only.
 */
export function usePushSubscription() {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!pushSupported()) return;
    let cancelled = false;
    (async () => {
      try {
        const [{ publicKey }, registration] = await Promise.all([fetchPushVapid(), navigator.serviceWorker.ready]);
        if (cancelled || !publicKey) return;
        setSupported(true);
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setEnabled(Boolean(existing) && Notification.permission === 'granted');
      } catch {
        // Offline or the SW never registered; the toggle simply stays hidden.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const enable = useCallback(async () => {
    setBusy(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return false;

      const [{ publicKey }, registration] = await Promise.all([fetchPushVapid(), navigator.serviceWorker.ready]);
      if (!publicKey) return false;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const body = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await registerPushSubscription(body);
      setEnabled(true);
      return true;
    } catch {
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const disable = useCallback(async () => {
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
    } finally {
      setBusy(false);
    }
  }, []);

  return { supported, enabled, busy, enable, disable };
}
