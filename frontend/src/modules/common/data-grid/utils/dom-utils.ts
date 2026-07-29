import type { Maybe } from '../types';

/** Stops propagation for a React synthetic event. */
export function stopPropagation(event: React.SyntheticEvent) {
  event.stopPropagation();
}

/** Scrolls an element into view when it is outside its container. */
export function scrollIntoView(element: Maybe<Element>, behavior: ScrollBehavior = 'instant') {
  element?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior });
}
