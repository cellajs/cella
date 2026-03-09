import { type RefObject, useEffect } from 'react';

interface UseDoubleClickOptions {
  ref: RefObject<HTMLButtonElement | HTMLElement | null>;
  /** CSS selector — only clicks inside a matching ancestor are tracked */
  container?: string;
  /** CSS selector — clicks on or inside a matching element are ignored */
  excludeSelector?: string;
  latency?: number;
  onSingleClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
}

/**
 * A simple React hook for differentiating single and double clicks on the same component.
 *
 * @param ref - Dom node to watch for double clicks
 * @param latency - The amount of time (in milliseconds) to wait before differentiating a single from a double click, default 300
 * @param onSingleClick - A callback function for single click events
 * @param onDoubleClick - A callback function for double click events
 * @param container - CSS selector to restrict tracking to clicks inside a matching ancestor
 * @param excludeSelector - CSS selector to ignore clicks on matching elements
 */
export function useDoubleClick({
  ref,
  latency = 300,
  container,
  excludeSelector,
  onSingleClick = () => null,
  onDoubleClick = () => null,
}: UseDoubleClickOptions) {
  useEffect(() => {
    const clickRef = ref.current;
    if (!clickRef) return;

    let clickCount = 0;
    const handleClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Only track clicks inside the specified container
      if (container && !target.closest(container)) return;

      // Ignore clicks on excluded elements
      if (excludeSelector && target.closest(excludeSelector)) return;

      clickCount += 1;

      setTimeout(() => {
        if (clickCount === 1) onSingleClick(e as MouseEvent);
        else if (clickCount === 2) onDoubleClick(e as MouseEvent);

        clickCount = 0;
      }, latency);
    };

    clickRef.addEventListener('click', handleClick);

    return () => {
      clickRef.removeEventListener('click', handleClick);
    };
  });
}
