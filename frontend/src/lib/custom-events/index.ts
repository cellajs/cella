import type { CustomEventMap, CustomEventsWithData } from '~/lib/custom-events/types';

declare global {
  interface WindowEventMap extends CustomEventMap {}
}

// dispatch custom function
export function dispatchCustomEvent<EventName extends keyof CustomEventMap>(
  eventName: EventName,
  eventData: EventName extends keyof CustomEventsWithData ? CustomEventsWithData[EventName] : never,
): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: eventData }));
}
