import { type RefObject, useEffect } from 'react';

/**
 * A simple React hook for differentiating single and double clicks on the same component.
 *
 * @param {node} ref Dom node to watch for double clicks
 * @param {number} [latency=300] The amount of time (in milliseconds) to wait before differentiating a single from a double click
 * @param {function} onSingleClick A callback function for single click events
 * @param {function} onDoubleClick A callback function for double click events
 */

interface UseDoubleClickOptions {
  ref: RefObject<HTMLButtonElement>;
  latency?: number;
  onSingleClick?: (event: MouseEvent) => void;
  onDoubleClick?: (event: MouseEvent) => void;
}

const useDoubleClick = ({ ref, latency = 300, onSingleClick = () => null, onDoubleClick = () => null }: UseDoubleClickOptions) => {
  useEffect(() => {
    const clickRef = ref.current;
    if (!clickRef) return;

    let clickCount = 0;
    const handleClick = (e: MouseEvent) => {
      clickCount += 1;

      setTimeout(() => {
        if (clickCount === 1) onSingleClick(e);
        else if (clickCount === 2) onDoubleClick(e);

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
