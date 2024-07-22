import { useEffect } from 'react';

export function useEventListener<K extends keyof WindowEventMap>(eventName: K, handler: (event: WindowEventMap[K]) => void) {
  useEffect(() => {
    const listener = (event: WindowEventMap[K]) => handler(event);

    window.addEventListener(eventName, listener as EventListener);

    return () => {
      window.removeEventListener(eventName, listener as EventListener);
    };
  }, [eventName, handler]);
}
