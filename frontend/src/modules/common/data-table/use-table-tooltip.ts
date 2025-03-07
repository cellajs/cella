import { autoUpdate, computePosition, offset } from '@floating-ui/dom';
import { useEffect, useRef } from 'react';

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

  useEffect(() => {
    if (!gridRef?.current) return;
    const tooltip = document.createElement('div');

    tooltip.className =
      'max-md:invisible bg-muted-foreground text-primary-foreground absolute pointer-events-none hidden font-light rounded-md text-xs px-3 py-1.5 z-200';
    document.body.appendChild(tooltip);
    tooltipRef.current = tooltip;

    const showTooltip = (cell: HTMLElement) => {
      const tooltipContent = cell.getAttribute('data-tooltip-content') || '';
      if (!tooltipContent) return;

      tooltip.textContent = tooltipContent;
      tooltip.style.display = 'block';
      lastShownCellRef.current = cell;

      autoUpdate(cell, tooltip, () => {
        computePosition(cell, tooltip, {
          placement: 'right',
          middleware: [offset(4)],
        }).then(({ x, y }) => {
          Object.assign(tooltip.style, {
            left: `${x}px`,
            top: `${y}px`,
          });
        });
      });

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
      observerRef.current?.disconnect();
    };

    // Attach event listeners
    gridRef.current.addEventListener('mousemove', handleMouseMove);
    gridRef.current.addEventListener('mouseleave', handleMouseLeave);
    gridRef.current.addEventListener('focusin', handleFocus);
    gridRef.current.addEventListener('focusout', clearTooltip);

    return () => {
      gridRef.current?.removeEventListener('mousemove', handleMouseMove);
      gridRef.current?.removeEventListener('mouseleave', handleMouseLeave);
      gridRef.current?.removeEventListener('focusin', handleFocus);
      gridRef.current?.removeEventListener('focusout', clearTooltip);
      observerRef.current?.disconnect();
      tooltip.remove();
    };
  }, [initialDone]);

  return { tooltipRef };
}
