import { autoScrollForElements, autoScrollWindowForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { type RefObject, useEffect } from 'react';
import { getScrollParent } from '~/utils/scroll-parent';

/** Auto-scrolls the grid's vertical scroll parent or the window during a drag; `.rdg` itself scrolls only horizontally. */
export function useDragAutoScroll(gridRef: RefObject<HTMLDivElement | null>, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const grid = gridRef.current;
    if (!grid) return;

    const scrollParent = getScrollParent(grid);
    if (scrollParent instanceof HTMLElement) return autoScrollForElements({ element: scrollParent, getAllowedAxis: () => 'vertical' });
    return autoScrollWindowForElements({ getAllowedAxis: () => 'vertical' });
  }, [enabled, gridRef]);
}
