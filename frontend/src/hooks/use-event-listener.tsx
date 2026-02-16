import { useEffect } from 'react';

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

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(eventName, handler, { passive });
    return () => window.removeEventListener(eventName, handler);
  }, [eventName, handler, enabled, passive]);
}
