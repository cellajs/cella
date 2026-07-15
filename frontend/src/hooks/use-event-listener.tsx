import { useEffect, useEffectEvent } from 'react';

/** Listens for a window event while `options.enabled` (default true). `passive`: handler never calls preventDefault. */
export function useEventListener<K extends keyof WindowEventMap>(
  eventName: K,
  handler: (event: WindowEventMap[K]) => void,
  options?: { enabled?: boolean; passive?: boolean },
): void {
  const { enabled = true, passive } = options ?? {};
  const onEvent = useEffectEvent(handler);

  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(eventName, onEvent, { passive });
    return () => window.removeEventListener(eventName, onEvent);
  }, [eventName, enabled, passive]);
}
