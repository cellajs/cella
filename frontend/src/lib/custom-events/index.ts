import type { CombinedCustomEventMap, CustomEventsWithData } from '~/lib/custom-events/types';

declare global {
  interface WindowEventMap extends CombinedCustomEventMap {}
}

// dispatch custom function
export function dispatchCustomEvent<EventName extends keyof CombinedCustomEventMap>(
  eventName: EventName,
  eventData?: EventName extends keyof CustomEventsWithData ? CustomEventsWithData[EventName] : never,
): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: eventData }));
}
