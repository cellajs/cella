import { useEffect, useEffectEvent } from 'react';

interface UseEventListenerOptions {
  /** Default true. */
  enabled?: boolean;
  /** The handler never calls preventDefault. */
  passive?: boolean;
  /** Listens in the capture phase: the handler runs before a widget on the way stops the event, as a Base UI popup does with arrow keys. */
  capture?: boolean;
}

/** Listens for a window event while `enabled`. */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  { enabled = true, passive, capture }: UseEventListenerOptions = {},
): void {
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(eventName, onEvent, { passive, capture });
    return () => window.removeEventListener(eventName, onEvent, { capture });
  }, [eventName, enabled, passive, capture]);
}
