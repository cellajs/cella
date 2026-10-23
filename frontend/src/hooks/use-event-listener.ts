import { useEffect, useEffectEvent } from 'react';

interface UseEventListenerOptions {
  /** Default true. */
  enabled?: boolean;
  /** The handler never calls preventDefault. */
  passive?: boolean;
}

/** Listens for a window event while `enabled`. */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  { enabled = true, passive }: UseEventListenerOptions = {},
): void {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(eventName, onEvent, { passive });
    return () => window.removeEventListener(eventName, onEvent);
  }, [eventName, enabled, passive]);
}
