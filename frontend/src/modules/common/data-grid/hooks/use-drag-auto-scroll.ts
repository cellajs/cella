import {
  autoScrollForElements,
  autoScrollWindowForElements,
} from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type RefObject, useEffect, useRef } from 'react';

/** Nearest vertically-scrollable ancestor, matching `getScrollParent` in `useGridDimensions`. */
function findScrollParent(start: HTMLElement | null): HTMLElement | null {
  let parent: HTMLElement | null = start;
  while (parent) {
    if (parent === document.body || parent === document.documentElement) return null;
    const { overflowY } = getComputedStyle(parent);
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
      return parent;
    }
    parent = parent.parentElement;
  }
  return null;
}

/** Auto-scrolls the cached vertical ancestor or the window during a drag; `.rdg` itself scrolls only horizontally. */
export function useDragAutoScroll(gridRef: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  const scrollParentRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const grid = gridRef.current;
    if (!grid) return;

    scrollParentRef.current = findScrollParent(grid.parentElement);

    if (scrollParentRef.current) {
      return autoScrollForElements({
        element: scrollParentRef.current,
        getAllowedAxis: () => 'vertical',
      });
    }
    return autoScrollWindowForElements({
      getAllowedAxis: () => 'vertical',
    });
  }, [enabled, gridRef]);
}
