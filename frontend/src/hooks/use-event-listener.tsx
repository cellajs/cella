import { useEffect } from 'react';

// This hook is used for listening event including CustomEvents
export function useEventListener<K extends keyof WindowEventMap>(eventName: K, handler: (event: WindowEventMap[K]) => void) {
  useEffect(() => {
    const listener = (event: WindowEventMap[K]) => handler(event);

    window.addEventListener(eventName, listener);
    return () => window.removeEventListener(eventName, listener);
  }, [eventName, handler]);
}
