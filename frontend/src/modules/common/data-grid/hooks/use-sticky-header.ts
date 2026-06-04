import type { RefObject } from 'react';
import { useLayoutEffect } from 'react';

const STICKY_CLASS = 'rdg-header-sticky';

/**
 * Pins header cells to the viewport top using `position: fixed` when the grid
 * scrolls past the top edge. Each cell gets an explicit pixel width matching
 * its CSS-grid-computed width and a `left` offset derived from the grid's
 * horizontal position minus its scrollLeft.
 *
 * Vertical pinning is zero-lag (fixed positioning is compositor-handled).
 * Horizontal sync runs in a rAF callback — acceptable trade-off per requirements.
 */
export function useStickyHeader(
  gridRef: RefObject<HTMLDivElement | null>,
  headerRowsCount: number,
  headerRowHeight: number,
  enabled: boolean,
) {
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!enabled || !grid || headerRowsCount === 0) return;

    const headerRowsHeight = headerRowsCount * headerRowHeight;
    // Separate rAF IDs so different concerns don't cancel each other
    let scrollRafId = 0;
    let hScrollRafId = 0;
    let resizeRafId = 0;
    let resizeSettleTimer = 0;
    let isSticky = false;
    let headerCells: HTMLElement[] = [];
    // Cache original inline styles to restore on unpin
    let originalStyles: { cssText: string }[] = [];

    function getHeaderCells(): HTMLElement[] {
      return Array.from(grid!.querySelectorAll<HTMLElement>('.rdg-header-row > .rdg-cell'));
    }

    function applyFixed() {
      headerCells = getHeaderCells();
      originalStyles = headerCells.map((cell) => ({ cssText: cell.style.cssText }));

      // Measure each cell's bounding rect before changing position
      const rects = headerCells.map((cell) => cell.getBoundingClientRect());

      for (let i = 0; i < headerCells.length; i++) {
        const cell = headerCells[i];
        const rect = rects[i];
        cell.style.position = 'fixed';
        cell.style.zIndex = '20';
        cell.style.top = '0px';
        cell.style.left = `${rect.left}px`;
        cell.style.width = `${rect.width}px`;
        cell.style.height = `${headerRowHeight}px`;
        cell.style.display = 'flex';
        cell.style.backgroundColor = 'var(--background)';
      }

      // Reserve space so content doesn't jump
      grid!.style.setProperty('--rdg-sticky-offset', `${headerRowsHeight}px`);
      grid!.classList.add(STICKY_CLASS);
      isSticky = true;
    }

    function removeFixed() {
      for (let i = 0; i < headerCells.length; i++) {
        headerCells[i].style.cssText = originalStyles[i].cssText;
      }
      grid!.classList.remove(STICKY_CLASS);
      grid!.style.removeProperty('--rdg-sticky-offset');
      headerCells = [];
      originalStyles = [];
      isSticky = false;
    }

    /** Update horizontal position of fixed cells based on grid scroll */
    function syncHorizontal() {
      if (!isSticky || headerCells.length === 0) return;
      const gridRect = grid!.getBoundingClientRect();
      const scrollLeft = grid!.scrollLeft;
      const gridLeft = gridRect.left;
      const gridRight = gridRect.right;

      let currentLeft = gridLeft - scrollLeft;
      for (const cell of headerCells) {
        const w = Number.parseFloat(cell.style.width);
        cell.style.left = `${currentLeft}px`;

        // Hide cells that are fully outside the grid's visible bounds
        const cellRight = currentLeft + w;
        cell.style.visibility = cellRight <= gridLeft || currentLeft >= gridRight ? 'hidden' : '';

        currentLeft += w;
      }
    }

    /** Re-measure widths from measuring cells and apply to fixed header cells */
    function syncWidths() {
      if (!isSticky || headerCells.length === 0) return;
      const measuringCells = grid!.querySelectorAll<HTMLElement>('[data-measuring-cell-key]');
      if (measuringCells.length === 0) return;

      const widths: number[] = [];
      for (const mc of measuringCells) {
        widths.push(mc.getBoundingClientRect().width);
      }

      for (let i = 0; i < headerCells.length && i < widths.length; i++) {
        headerCells[i].style.width = `${widths[i]}px`;
      }

      syncHorizontal();
    }

    function update() {
      const rect = grid!.getBoundingClientRect();
      const gridTop = rect.top;
      const gridBottom = rect.bottom;
      const shouldStick = gridTop < 0 && gridBottom > headerRowsHeight;

      if (shouldStick && !isSticky) {
        applyFixed();
      } else if (!shouldStick && isSticky) {
        removeFixed();
      }

      if (isSticky) {
        syncHorizontal();
      }
    }

    const onScrollVertical = () => {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = requestAnimationFrame(update);
    };

    const onScrollHorizontal = () => {
      if (!isSticky) return;
      cancelAnimationFrame(hScrollRafId);
      hScrollRafId = requestAnimationFrame(syncHorizontal);
    };

    const onResize = () => {
      if (!isSticky) return;
      // Immediate rAF for responsiveness
      cancelAnimationFrame(resizeRafId);
      resizeRafId = requestAnimationFrame(syncWidths);
      // Trailing settle: guarantee final sync after resize activity stops
      clearTimeout(resizeSettleTimer);
      resizeSettleTimer = window.setTimeout(syncWidths, 150);
    };

    // Find the vertical scroll container
    let scrollTarget: HTMLElement | Window = window;
    let parent: HTMLElement | null = grid.parentElement;
    while (parent && parent !== document.body && parent !== document.documentElement) {
      const { overflowY } = getComputedStyle(parent);
      if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') {
        scrollTarget = parent;
        break;
      }
      parent = parent.parentElement;
    }

    scrollTarget.addEventListener('scroll', onScrollVertical, { passive: true });
    window.addEventListener('resize', onScrollVertical, { passive: true });
    // Also sync widths on window resize (viewport change)
    window.addEventListener('resize', onResize, { passive: true });
    // Track horizontal scroll on the grid itself (it has overflow-x: auto)
    grid.addEventListener('scroll', onScrollHorizontal, { passive: true });

    // Watch measuring cells for width changes (triggered by column resize)
    const resizeObserver = new ResizeObserver(onResize);
    for (const mc of grid.querySelectorAll('[data-measuring-cell-key]')) {
      resizeObserver.observe(mc);
    }

    // Initial check
    update();

    return () => {
      cancelAnimationFrame(scrollRafId);
      cancelAnimationFrame(hScrollRafId);
      cancelAnimationFrame(resizeRafId);
      clearTimeout(resizeSettleTimer);
      resizeObserver.disconnect();
      scrollTarget.removeEventListener('scroll', onScrollVertical);
      window.removeEventListener('resize', onScrollVertical);
      window.removeEventListener('resize', onResize);
      grid.removeEventListener('scroll', onScrollHorizontal);
      if (isSticky) removeFixed();
    };
  }, [gridRef, headerRowsCount, headerRowHeight, enabled]);
}
