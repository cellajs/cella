import { useEffect } from 'react';

/**
 * Hook to listen for window events, including CustomEvents
 *
 * @param eventName - Event type to listen for.
 * @param handler - Function to handle event.
 */

export function useEventListener<K extends keyof WindowEventMap>(eventName: K, handler: (event: WindowEventMap[K]) => void) {
  useEffect(() => {
    const listener = (event: WindowEventMap[K]) => handler(event);

    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName, handler]);
}
