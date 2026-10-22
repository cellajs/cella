import { useEffect } from 'react';
import { tw } from '~/utils/tw';

/** Delay before a tooltip first appears on hover (ms). */
const showDelay = 400;
/** After a tooltip hides, the next one appears without delay within this window (ms). */
const skipDelayWindow = 500;

const tooltipClass = tw(
  'pointer-events-none fixed z-200 hidden rounded-md bg-muted-foreground px-3 py-1.5 text-primary-foreground text-xs max-md:invisible',
);

const positionTooltip = (reference: HTMLElement, tooltip: HTMLElement, gap = 4) => {
  const rect = reference.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();
  Object.assign(tooltip.style, { left: `${rect.right + gap}px`, top: `${rect.top + (rect.height - tooltipRect.height) / 2}px` });
};

/** Data grid tooltip driven by DOM listeners outside React, so hovering never re-renders the grid. */
export function useTableTooltip(gridElement: HTMLDivElement | null) {
  useEffect(() => {
    if (!gridElement) return;
    const tooltip = document.createElement('div');
    // A tap fires compatibility mousemoves, so hover only counts for a pointer that can hover (jsdom has no matchMedia).
    const hoverQuery = window.matchMedia?.('(hover: hover)');
    let showTimeout: number | undefined;
    let shownCell: HTMLElement | null = null;
    let lastHiddenAt = 0;
    let observer: MutationObserver | undefined;

    tooltip.className = tooltipClass;
    document.body.appendChild(tooltip);

    const clearTooltip = () => {
      clearTimeout(showTimeout);
      // Stamp the hide time so a quick move to the next trigger skips the delay.
      if (shownCell) lastHiddenAt = Date.now();
      tooltip.style.display = 'none';
      shownCell = null;
      observer?.disconnect();
    };

    const showTooltip = (cell: HTMLElement) => {
      const tooltipContent = cell.getAttribute('data-tooltip-content') || '';
      if (!tooltipContent) return;

      tooltip.textContent = tooltipContent;
      tooltip.style.display = 'block';
      shownCell = cell;
      positionTooltip(cell, tooltip);

      // Grid renders can recycle the cell (new content) or remove it (virtualization, row updates): follow it or clear.
      observer?.disconnect();
      observer = new MutationObserver(() => {
        if (!cell.isConnected) return clearTooltip();
        tooltip.textContent = cell.getAttribute('data-tooltip-content') || '';
        positionTooltip(cell, tooltip);
      });
      observer.observe(cell, { attributes: true, attributeFilter: ['data-tooltip-content'] });
      observer.observe(gridElement, { childList: true, subtree: true });
    };

    // `data-tooltip="true"` always qualifies; `data-tooltip="compact"` only inside a compacted grid.
    const resolveTooltipCell = (target: EventTarget | null): HTMLElement | null => {
      const cell = target instanceof Element ? target.closest<HTMLElement>('[data-tooltip]') : null;
      if (!cell) return null;
      if (cell.dataset.tooltip === 'compact' && !cell.closest('[data-is-compact="true"]')) return null;
      return cell;
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (hoverQuery && !hoverQuery.matches) return;
      const cell = resolveTooltipCell(event.target);
      if (!cell) return clearTooltip();

      if (shownCell === cell) return;

      clearTimeout(showTimeout);

      // Show instantly while one is already up, or shortly after one hid (pass-over across gaps).
      const skipDelay = shownCell !== null || Date.now() - lastHiddenAt < skipDelayWindow;
      if (skipDelay) {
        showTooltip(cell);
      } else {
        showTimeout = window.setTimeout(() => showTooltip(cell), showDelay);
      }
    };

    const handleFocus = (event: FocusEvent) => {
      const cell = resolveTooltipCell(event.target);
      if (cell) showTooltip(cell);
    };

    // Window capture sees every scroll: the grid's own (or a nested one) clears, an ancestor's moves the tooltip with its cell.
    const handleScroll = (event: Event) => {
      if (event.target instanceof Node && gridElement.contains(event.target)) return clearTooltip();
      if (shownCell) positionTooltip(shownCell, tooltip);
    };

    gridElement.addEventListener('mousemove', handleMouseMove);
    gridElement.addEventListener('mouseleave', clearTooltip);
    gridElement.addEventListener('focusin', handleFocus);
    gridElement.addEventListener('focusout', clearTooltip);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });

    return () => {
      gridElement.removeEventListener('mousemove', handleMouseMove);
      gridElement.removeEventListener('mouseleave', clearTooltip);
      gridElement.removeEventListener('focusin', handleFocus);
      gridElement.removeEventListener('focusout', clearTooltip);
      window.removeEventListener('scroll', handleScroll, { capture: true });
      clearTimeout(showTimeout);
      observer?.disconnect();
      tooltip.remove();
    };
  }, [gridElement]);
}
