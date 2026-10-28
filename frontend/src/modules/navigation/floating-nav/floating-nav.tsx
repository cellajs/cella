import { useEffect, useState } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';
import { useNavigationStore } from '~/modules/navigation/navigation-store';

interface FloatingNavProps {
  items: FloatingNavItem[];
  /** Any change to this value resets visibility to visible: pass a page key, sidebar state, etc. */
  resetTrigger?: unknown;
}

const labelCollapseMs = 350; // Label collapse duration (300ms) plus margin, so buttons hide only once the text is gone

export function FloatingNav({ items, resetTrigger }: FloatingNavProps) {
  const isMobile = useBreakpointBelow('sm');
  const { isVisible: showButtons, reset } = useScrollVisibility(isMobile);
  const setFloatingNavActive = useNavigationStore((state) => state.setFloatingNavActive);

  useEffect(() => {
    if (resetTrigger !== undefined) reset();
  }, [resetTrigger, reset]);

  // Hold a labelled button on screen while its label collapses, so the text animates out before the button drops away.
  // Decided in render from the values before: a scroll down from the top collapses the label and hides the buttons at
  // once, and a label that expanded off-screen never flashes its button.
  const hasExpandedLabel = items.some((item) => item.label && item.labelVisible);
  const [previous, setPrevious] = useState({ hasExpandedLabel, showButtons });
  const [isLabelCollapsing, setIsLabelCollapsing] = useState(false);
  if (previous.hasExpandedLabel !== hasExpandedLabel || previous.showButtons !== showButtons) {
    setPrevious({ hasExpandedLabel, showButtons });
    if (hasExpandedLabel) setIsLabelCollapsing(false);
    else if (previous.hasExpandedLabel && previous.showButtons) setIsLabelCollapsing(true);
  }
  useEffect(() => {
    if (!isLabelCollapsing) return;
    const timeout = setTimeout(() => setIsLabelCollapsing(false), labelCollapseMs);
    return () => clearTimeout(timeout);
  }, [isLabelCollapsing]);

  const isActive = isMobile && items.some((item) => item.visible !== false);

  // The active flag reaches CSS through the body class (app-layout, menu sheet header) and React through the store (bottom bar)
  useBodyClass({ 'floating-nav': isActive });
  useEffect(() => {
    setFloatingNavActive(isActive);
    return () => setFloatingNavActive(false);
  }, [isActive, setFloatingNavActive]);

  if (items.length === 0) return null;

  return (
    <nav id="floating-nav" className="print:hidden">
      {items.map((item) => {
        const isItemVisible = (showButtons || (isLabelCollapsing && !!item.label)) && item.visible !== false;
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
