import { useEffect } from 'react';
import { useLatestRef } from './use-latest-ref';

// TODO could we drop this as its an anti pattern anyways? What options do we have?
/**
 * Hook to listen for window events.
 *
 * @param eventName - Event type to listen for.
 * @param handler - Function to handle the event.
 * @param options - Optional configuration.
 * @param options.enabled - Whether the listener is active (defaults to true).
 * @param options.passive - Indicates the handler will never call preventDefault.
 */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: { enabled?: boolean; passive?: boolean },
): void {
  const { enabled = true, passive } = options ?? {};
  const handlerRef = useLatestRef(handler);

  useEffect(() => {
    if (!enabled) return;

    const listener = (e: WindowEventMap[K]) => handlerRef.current(e);
    window.addEventListener(eventName, listener, { passive });
    return () => window.removeEventListener(eventName, listener);
  }, [eventName, enabled, passive]);
}
