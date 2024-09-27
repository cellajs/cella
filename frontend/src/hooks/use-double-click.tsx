import { type RefObject, useEffect } from 'react';

/**
 * A simple React hook for differentiating single and double clicks on the same component.
 *
 * @param {node} ref Dom node to watch for double clicks
 * @param {number} [latency=300] The amount of time (in milliseconds) to wait before differentiating a single from a double click
 * @param {function} onSingleClick A callback function for single click events
 * @param {function} onDoubleClick A callback function for double click events
 * @param {string[]} allowedTargets Set a Lover case element name that allow to be tracked by hook
 * @param {string[]} excludeIds Set a element id that excluded from tracking by hook
 */

interface UseDoubleClickOptions {
  ref: RefObject<HTMLButtonElement | HTMLElement>;
  allowedTargets?: string[];
  excludeIds?: string[];
  latency?: number;
  onSingleClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
}

const useDoubleClick = ({
  ref,
  latency = 300,
  excludeIds = [],
  allowedTargets = [],
  onSingleClick = () => null,
  onDoubleClick = () => null,
}: UseDoubleClickOptions) => {
  useEffect(() => {
    const clickRef = ref.current;
    if (!clickRef) return;

    let clickCount = 0;
    const handleClick = (e: Event) => {
      const targetElement = e.target as HTMLElement | null;

      // Ensure targetElement is not null before accessing its properties
      if (!targetElement) return;

      let isExcluded = false;
      let parentElement: HTMLElement | null = targetElement;
      while (parentElement) {
        if (excludeIds.includes(parentElement.id)) {
          isExcluded = true;
          break;
        }
        parentElement = parentElement.parentElement;
      }

      // Ignore the click if it matches an allowed target or if it's excluded
      if ((allowedTargets.length > 0 && !allowedTargets.includes(targetElement.localName)) || isExcluded) {
        return;
      }

      // Update the type of the event parameter to Event
      clickCount += 1;

      setTimeout(() => {
        if (clickCount === 1)
          onSingleClick(e as MouseEvent); // Cast the event to MouseEvent
        else if (clickCount === 2) onDoubleClick(e as MouseEvent); // Cast the event to MouseEvent

        clickCount = 0;
      }, latency);
    };

    // Add event listener for click events
    clickRef.addEventListener('click', handleClick);

    // Remove event listener
    return () => {
      clickRef.removeEventListener('click', handleClick);
    };
  });
};

export default useDoubleClick;
