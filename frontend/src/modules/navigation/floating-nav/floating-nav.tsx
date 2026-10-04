import { type RefObject, useEffect, useRef, useState } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { getViewportBottom, subscribeViewportBottom } from '~/utils/viewport-observer';

interface FloatingNavProps {
  items: FloatingNavItem[];
  /** Defaults to window. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  bodyClass?: string;
  /** Any change to this value resets visibility to visible: pass a page key, sidebar state, etc. */
  resetTrigger?: unknown;
}

/** Scopes the hidden viewport bottom to the nav, so its per-frame changes restyle only the buttons. */
function trackViewportBottom(nav: HTMLElement | null) {
  if (!nav) return;
  const apply = (px: number) => nav.style.setProperty('--vv-bottom', `${px}px`);
  apply(getViewportBottom());
  return subscribeViewportBottom(apply);
}

const LABEL_COLLAPSE_MS = 350; // Label collapse duration (300ms) plus margin, so buttons hide only once the text is gone

export function FloatingNav({ items, scrollContainerRef, bodyClass = 'floating-nav', resetTrigger }: FloatingNavProps) {
  const isMobile = useBreakpointBelow('sm');
  const { isVisible: showButtons, reset } = useScrollVisibility(isMobile, scrollContainerRef);
  const setFloatingNavActive = useNavigationStore((state) => state.setFloatingNavActive);

  useEffect(() => {
    if (resetTrigger !== undefined) reset();
  }, [resetTrigger, reset]);

  // Hold buttons on screen while an expanded label collapses, so the text animates out before the buttons drop away
  const hasExpandedLabel = items.some((item) => item.label && item.labelVisible);
  const [labelHold, setLabelHold] = useState(false);
  const prevExpanded = useRef(hasExpandedLabel);
  const showButtonsRef = useRef(showButtons);
  showButtonsRef.current = showButtons;
  useEffect(() => {
    const wasExpanded = prevExpanded.current;
    prevExpanded.current = hasExpandedLabel;
    if (hasExpandedLabel) {
      setLabelHold(false);
      return;
    }
    // Only hold when the collapse starts from a visible state; a label that expanded off-screen never flashes the buttons
    if (!wasExpanded || !showButtonsRef.current) return;
    setLabelHold(true);
    const timeout = setTimeout(() => setLabelHold(false), LABEL_COLLAPSE_MS);
    return () => clearTimeout(timeout);
  }, [hasExpandedLabel]);

  // Count items that could be visible (for body class and empty check)
  const visibleItems = items.filter((item) => item.visible !== false);
  const isActive = isMobile && visibleItems.length > 0;

  // Keep body class for CSS consumers (app-layout, menu-sheet header)
  useBodyClass({ [bodyClass]: isActive });

  // Sync to store for direct React consumers (bottom-bar-nav)
  useEffect(() => {
    setFloatingNavActive(isActive);
    return () => setFloatingNavActive(false);
  }, [isActive, setFloatingNavActive]);

  if (items.length === 0) return null;

  return (
    <nav id="floating-nav" ref={trackViewportBottom}>
      {items.map((item) => {
        // Combine global showButtons (plus the label-collapse hold) with individual item visibility
        const isItemVisible = (showButtons || labelHold) && item.visible !== false;
        return (
          <FloatingNavButton
            key={item.id}
            className={isItemVisible ? 'opacity-100' : 'pointer-events-none translate-y-16 scale-50 opacity-0'}
            id={item.id}
            icon={item.icon}
            onClick={item.onClick}
            ariaLabel={item.ariaLabel}
            direction={item.direction ?? 'right'}
            label={item.label}
            labelVisible={item.labelVisible}
          />
        );
      })}
    </nav>
  );
}
export type { FloatingNavItem } from '~/modules/navigation/floating-nav/button';
