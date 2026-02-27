import { useEffect } from 'react';
import { appStreamManager } from './stream-store';
import type { UseAppStreamOptions, UseAppStreamReturn } from './types';

const debugLabel = 'AppStream';

/**
 * Thin React wrapper around appStreamManager for real-time updates.
 * All reconnect logic (visibility, leader changes) is handled by StreamManager.
 */
export function useAppStream(options: UseAppStreamOptions = {}): UseAppStreamReturn {
  const { enabled = true, onStateChange } = options;

  const state = appStreamManager.useStore((s) => s.state);
  const cursor = appStreamManager.useStore((s) => s.cursor);

  // Connect/disconnect based on enabled prop
  useEffect(() => {
    if (enabled) {
      appStreamManager.connect();
    } else {
      appStreamManager.disconnect();
    }

    return () => {
      appStreamManager.disconnect();
    };
  }, [enabled]);

  // Notify callback on state changes
  useEffect(() => {
    onStateChange?.(state);
  }, [state, onStateChange]);

  return {
    state,
    cursor,
    reconnect: () => appStreamManager.reconnect(),
    disconnect: () => appStreamManager.disconnect(),
  };
}

/**
 * Component that connects to the app-scoped stream for real-time updates.
 * Handles membership, organization, and product entity events via CDC → ActivityBus pipeline.
 * Use in AppLayout for app-wide real-time sync.
 */
export function AppStream() {
  useAppStream({
    onStateChange: (state) => {
      if (state === 'live') console.debug(`[${debugLabel}] Connected and live`);
      if (state === 'error') console.debug(`[${debugLabel}] Connection error, will retry...`);
    },
  });

  return null;
}
