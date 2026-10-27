import { type RefObject, useEffect, useEffectEvent, useRef, useState } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';
import { useNavigationStore } from '~/modules/navigation/navigation-store';

interface FloatingNavProps {
  items: FloatingNavItem[];
  /** Defaults to window. */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  bodyClass?: string;
  /** Any change to this value resets visibility to visible: pass a page key, sidebar state, etc. */
  resetTrigger?: unknown;
}

const labelCollapseMs = 350; // Label collapse duration (300ms) plus margin, so buttons hide only once the text is gone

export function FloatingNav({ items, scrollContainerRef, bodyClass = 'floating-nav', resetTrigger }: FloatingNavProps) {
  const isMobile = useBreakpointBelow('sm');
  const { isVisible: showButtons, reset } = useScrollVisibility(isMobile, scrollContainerRef);
  const setFloatingNavActive = useNavigationStore((state) => state.setFloatingNavActive);

  useEffect(() => {
    if (resetTrigger !== undefined) reset();
  }, [resetTrigger, reset]);

  // Hold buttons on screen while an expanded label collapses, so the text animates out before the buttons drop away
  const hasExpandedLabel = items.some((item) => item.label && item.labelVisible);
  const [isLabelCollapsing, setIsLabelCollapsing] = useState(false);
  const wasExpandedRef = useRef(hasExpandedLabel);
  const isShowingButtons = useEffectEvent(() => showButtons);
  useEffect(() => {
    const wasExpanded = wasExpandedRef.current;
    wasExpandedRef.current = hasExpandedLabel;
    if (hasExpandedLabel) {
      setIsLabelCollapsing(false);
      return;
    }
    // Only hold when the collapse starts from a visible state; a label that expanded off-screen never flashes the buttons
    if (!wasExpanded || !isShowingButtons()) return;
    setIsLabelCollapsing(true);
    const timeout = setTimeout(() => setIsLabelCollapsing(false), labelCollapseMs);
    return () => clearTimeout(timeout);
  }, [hasExpandedLabel]);

  const isActive = isMobile && items.some((item) => item.visible !== false);

  // The active flag reaches CSS through the body class (app-layout, menu sheet header) and React through the store (bottom bar)
  useBodyClass({ [bodyClass]: isActive });
  useEffect(() => {
    setFloatingNavActive(isActive);
    return () => setFloatingNavActive(false);
  }, [isActive, setFloatingNavActive]);

  if (items.length === 0) return null;

  return (
    <nav id="floating-nav" className="print:hidden">
      {items.map((item) => {
        const isItemVisible = (showButtons || isLabelCollapsing) && item.visible !== false;
        return (
          <FloatingNavButton
            key={item.id}
            className={isItemVisible ? 'opacity-100' : 'pointer-events-none translate-y-16 scale-50 opacity-0'}
            id={item.id}
            icon={item.icon}
            onClick={item.onClick}
            ariaLabel={item.ariaLabel}
            direction={item.direction}
            label={item.label}
            labelVisible={item.labelVisible}
          />
        );
      })}
    </nav>
  );
}
export type { FloatingNavItem } from '~/modules/navigation/floating-nav/button';
