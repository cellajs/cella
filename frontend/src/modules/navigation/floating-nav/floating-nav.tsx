import { type RefObject, useEffect } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';

interface FloatingNavProps {
  /** Items to render as floating buttons */
  items: FloatingNavItem[];
  /** Ref to scroll container for visibility tracking (defaults to window) */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Custom body class to add when floating nav is active */
  bodyClass?: string;
  /** When this value changes, visibility is reset to visible */
  resetTrigger?: unknown;
}

/**
 * Floating navigation for mobile devices.
 * Renders FAB-style buttons that show/hide based on scroll direction.
 * Callers are responsible for building the items array.
 */
export function FloatingNav({ items, scrollContainerRef, bodyClass = 'floating-nav', resetTrigger }: FloatingNavProps) {
  const isMobile = useBreakpoints('max', 'sm');
  const { isVisible: showButtons, reset } = useScrollVisibility(isMobile, scrollContainerRef);

  // Reset visibility when resetTrigger changes (e.g., page change, sidebar toggle)
  useEffect(() => {
    if (resetTrigger !== undefined) reset();
  }, [resetTrigger, reset]);

  // Count items that could be visible (for body class and empty check)
  const visibleItems = items.filter((item) => item.visible !== false);

  useBodyClass({ [bodyClass]: isMobile && visibleItems.length > 0 });

  if (items.length === 0) return null;

  return (
    <nav id="floating-nav">
      {items.map((item) => {
        // Combine global showButtons with individual item visibility
        const isItemVisible = showButtons && item.visible !== false;
        return (
          <FloatingNavButton
            key={item.id}
            className={isItemVisible ? 'opacity-100' : 'opacity-0 -bottom-12 scale-50 pointer-events-none'}
            id={item.id}
            icon={item.icon}
            onClick={item.onClick}
            ariaLabel={item.ariaLabel}
            direction={item.direction ?? 'right'}
          />
        );
      })}
    </nav>
  );
}
export { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';
