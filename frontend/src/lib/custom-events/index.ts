import type { CombinedCustomEventMap, CustomEventsWithData } from '~/lib/custom-events/types';

declare global {
  interface WindowEventMap extends CombinedCustomEventMap {}
}

/**
 * Dispatches a custom event on the window object.
 *
 * This function allows triggering custom events with optional event data. It ensures type safety
 * for the event name and data by using TypeScript generics and event maps.
 *
 * @param eventName - The name of the event to dispatch (must be a key of CombinedCustomEventMap)
 * @param eventData - The event data to attach to the event (optional, based on event name)
 *
 */
export function dispatchCustomEvent<EventName extends keyof CombinedCustomEventMap>(
  eventName: EventName,
  eventData?: EventName extends keyof CustomEventsWithData ? CustomEventsWithData[EventName] : never,
): void {
  window.dispatchEvent(new CustomEvent(eventName, { detail: eventData }));
}
