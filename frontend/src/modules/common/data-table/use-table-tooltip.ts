import { useEffect, useRef } from 'react';

/**
 * Position tooltip to the right of the reference element with a gap, centered vertically.
 */
const positionTooltip = (reference: HTMLElement, tooltip: HTMLElement, gap = 4) => {
  const rect = reference.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  Object.assign(tooltip.style, {
    left: `${rect.right + gap}px`,
    top: `${rect.top + (rect.height - tooltipRect.height) / 2}px`,
  });
};

/**
 * Tooltip designed to be used with a data grid. Works largely outside of react to prevent rerendering/perf issues.
 * @param gridRef
 * @param initialDone
 */
export function useTableTooltip(gridRef: React.RefObject<HTMLDivElement | null>, initialDone: boolean) {
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const lastShownCellRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!gridRef?.current) return;
    const gridEl = gridRef.current;
    const tooltip = document.createElement('div');

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

      // Cancel previous positioning loop
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      // Position immediately, then keep in sync via rAF (handles virtualization recycling)
      positionTooltip(cell, tooltip);
      const track = () => {
        if (!cell.isConnected) return clearTooltip();
        positionTooltip(cell, tooltip);
        rafRef.current = requestAnimationFrame(track);
      };
      rafRef.current = requestAnimationFrame(track);

      observerRef.current?.disconnect();
      observerRef.current = new MutationObserver(() => updateTooltipContent(cell));
      observerRef.current.observe(cell, { attributes: true, attributeFilter: ['data-tooltip-content'] });
    };

    const updateTooltipContent = (cell: HTMLElement) => {
      const tooltipContent = cell.getAttribute('data-tooltip-content') || '';
      tooltip.textContent = tooltipContent;
    };

    const handleMouseMove = (e: MouseEvent) => {
      const cell: HTMLElement | null = (e.target as HTMLElement).closest("[data-tooltip='true']");
      if (!cell) return clearTooltip();

      // Already showing tooltip for this exact element
      if (lastShownCellRef.current === cell) return;

      if (timeoutRef.current) clearTimeout(timeoutRef.current);

      if (lastShownCellRef.current) {
        showTooltip(cell);
      } else {
        timeoutRef.current = window.setTimeout(() => showTooltip(cell), 400);
      }
    };

    const handleFocus = (e: FocusEvent) => {
      const cell: HTMLElement | null = (e.target as HTMLElement).closest("[data-tooltip='true']");
      if (cell) showTooltip(cell);
    };

    const handleMouseLeave = () => {
      clearTooltip();

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const clearTooltip = () => {
      tooltip.style.display = 'none';
      lastShownCellRef.current = null;
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      observerRef.current?.disconnect();
    };

    // Attach event listeners
    gridEl.addEventListener('mousemove', handleMouseMove);
    gridEl.addEventListener('mouseleave', handleMouseLeave);
    gridEl.addEventListener('focusin', handleFocus);
    gridEl.addEventListener('focusout', clearTooltip);
    gridEl.addEventListener('scroll', clearTooltip, { capture: true, passive: true });

    return () => {
      gridEl.removeEventListener('mousemove', handleMouseMove);
      gridEl.removeEventListener('mouseleave', handleMouseLeave);
      gridEl.removeEventListener('focusin', handleFocus);
      gridEl.removeEventListener('focusout', clearTooltip);
      gridEl.removeEventListener('scroll', clearTooltip, { capture: true });
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      observerRef.current?.disconnect();
      tooltip.remove();
    };
  }, [initialDone]);

  return { tooltipRef };
}
