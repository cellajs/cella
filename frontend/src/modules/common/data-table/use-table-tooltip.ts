import { useEffect, useRef } from 'react';

/** Delay before a tooltip first appears on hover (ms). */
const showDelay = 400;
/** After a tooltip hides, the next one appears without delay within this window (ms). */
const skipDelayWindow = 500;

const positionTooltip = (reference: HTMLElement, tooltip: HTMLElement, gap = 4) => {
  const rect = reference.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  Object.assign(tooltip.style, { left: `${rect.right + gap}px`, top: `${rect.top + (rect.height - tooltipRect.height) / 2}px` });
};

/** Data grid tooltip driven by DOM listeners outside React, so hovering never re-renders the grid. */
export function useTableTooltip(gridRef: React.RefObject<HTMLDivElement | null>, initialDone: boolean) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastShownCellRef = useRef<HTMLElement | null>(null);
  const lastHiddenAtRef = useRef<number>(0);
  const observerRef = useRef<MutationObserver | null>(null);

  useEffect(() => {
    if (!gridRef?.current) return;
    const gridEl = gridRef.current;
    const tooltip = document.createElement('div');
    // A tap fires compatibility mousemoves, so hover only counts for a pointer that can hover (jsdom has no matchMedia).
    const canHover = window.matchMedia?.('(hover: hover)');

    tooltip.className =
      'max-md:invisible bg-muted-foreground text-primary-foreground fixed pointer-events-none hidden rounded-md text-xs px-3 py-1.5 z-200';
    document.body.appendChild(tooltip);
    tooltipRef.current = tooltip;

    const showTooltip = (cell: HTMLElement) => {
      const tooltipContent = cell.getAttribute('data-tooltip-content') || '';
      if (!tooltipContent) return;

      tooltip.textContent = tooltipContent;
      tooltip.style.display = 'block';
      lastShownCellRef.current = cell;
      positionTooltip(cell, tooltip);

      // Grid renders can recycle the cell (new content) or remove it (virtualization, row updates): follow it or clear.
      observerRef.current?.disconnect();
      observerRef.current = new MutationObserver(() => {
        if (!cell.isConnected) return clearTooltip();
        tooltip.textContent = cell.getAttribute('data-tooltip-content') || '';
        positionTooltip(cell, tooltip);
      });
      observerRef.current.observe(cell, { attributes: true, attributeFilter: ['data-tooltip-content'] });
      observerRef.current.observe(gridEl, { childList: true, subtree: true });
    };

    // `data-tooltip="true"` always qualifies; `data-tooltip="compact"` only inside a compacted grid.
    const resolveTooltipCell = (target: HTMLElement): HTMLElement | null => {
      const cell = target.closest<HTMLElement>('[data-tooltip]');
      if (!cell) return null;
      if (cell.dataset.tooltip === 'compact' && !cell.closest('[data-is-compact="true"]')) return null;
      return cell;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (canHover && !canHover.matches) return;
      const cell = resolveTooltipCell(e.target as HTMLElement);
      if (!cell) return clearTooltip();

      if (lastShownCellRef.current === cell) return;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      // Show instantly while one is already up, or shortly after one hid (pass-over across gaps).
      const skipDelay = lastShownCellRef.current !== null || Date.now() - lastHiddenAtRef.current < skipDelayWindow;
      if (skipDelay) {
        showTooltip(cell);
      } else {
        timeoutRef.current = window.setTimeout(() => showTooltip(cell), showDelay);
      }
    };

    const handleFocus = (e: FocusEvent) => {
      const cell = resolveTooltipCell(e.target as HTMLElement);
      if (cell) showTooltip(cell);
    };

    const handleMouseLeave = () => clearTooltip();

    const clearTooltip = () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Stamp the hide time so a quick move to the next trigger skips the delay.
      if (lastShownCellRef.current) lastHiddenAtRef.current = Date.now();
      tooltip.style.display = 'none';
      lastShownCellRef.current = null;
      observerRef.current?.disconnect();
    };

    // Window capture sees every scroll: the grid's own (or a nested one) clears, an ancestor's moves the tooltip with its cell.
    const handleScroll = (e: Event) => {
      if (e.target instanceof Node && gridEl.contains(e.target)) return clearTooltip();
      const cell = lastShownCellRef.current;
      if (cell) positionTooltip(cell, tooltip);
    };

    gridEl.addEventListener('mousemove', handleMouseMove);
    gridEl.addEventListener('mouseleave', handleMouseLeave);
    gridEl.addEventListener('focusin', handleFocus);
    gridEl.addEventListener('focusout', clearTooltip);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      gridEl.removeEventListener('mousemove', handleMouseMove);
      gridEl.removeEventListener('mouseleave', handleMouseLeave);
      gridEl.removeEventListener('focusin', handleFocus);
      gridEl.removeEventListener('focusout', clearTooltip);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      observerRef.current?.disconnect();
      tooltip.remove();
    };
  }, [initialDone]);

  return { tooltipRef };
}
