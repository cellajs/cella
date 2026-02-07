import { useRouterState } from '@tanstack/react-router';
import { type RefObject, useEffect, useRef } from 'react';
import { useBodyClass } from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { FloatingNavButton, type FloatingNavItem } from '~/modules/navigation/floating-nav/button';
import type { TriggerNavItemFn } from '~/modules/navigation/types';
import { navItems } from '~/nav-config';

interface FloatingNavProps {
  /** Custom items to render (bypasses route-based navItems) */
  items?: FloatingNavItem[];
  /** For app navigation - triggers nav item by id */
  triggerNavItem?: TriggerNavItemFn;
  /** Ref to scroll container for visibility tracking (defaults to window) */
  scrollContainerRef?: RefObject<HTMLElement | null>;
  /** Custom body class to add when floating nav is active */
  bodyClass?: string;
  /** When this value changes, visibility is reset to visible */
  resetTrigger?: unknown;
  /** Callback when scroll position changes */
  onScrollTopChange?: (scrollTop: number) => void;
}

/**
 * Floating navigation for mobile devices.
 * - Shows/hides buttons based on scroll direction.
 * - Supports custom items or route-based nav items from staticData.
 */
export function FloatingNav({
  items: customItems,
  triggerNavItem,
  scrollContainerRef,
  bodyClass = 'floating-nav',
  resetTrigger,
  onScrollTopChange,
}: FloatingNavProps) {
  const routerState = useRouterState();
  const isMobile = useBreakpoints('max', 'sm');
  const { isVisible: showButtons, scrollTop, reset } = useScrollVisibility(isMobile, scrollContainerRef);

  // Find the route that defines floatingNavButtons (the "owning" page route)
  // Tab routes don't define this, so they inherit from parent - we track the parent's path
  const floatingNavOwner = routerState.matches.findLast((m) => m.staticData.floatingNavButtons);
  const ownerPath = floatingNavOwner?.pathname;
  const prevOwnerPath = useRef(ownerPath);

  // Reset visibility when the owning route's path changes (page change, not tab change)
  useEffect(() => {
    if (prevOwnerPath.current !== ownerPath) {
      prevOwnerPath.current = ownerPath;
      reset();
    }
  }, [ownerPath, reset]);

  // Notify parent of scroll position changes
  useEffect(() => {
    onScrollTopChange?.(scrollTop);
  }, [scrollTop, onScrollTopChange]);

  // Reset visibility when resetTrigger changes (e.g., sidebar closes)
  useEffect(() => {
    if (resetTrigger !== undefined) reset();
  }, [resetTrigger, reset]);

  // Build items array - either custom items or from route staticData
  let items: FloatingNavItem[] = [];

  if (customItems) {
    // Use custom items directly (keep all for animation, visibility handled per-item)
    items = customItems;
  } else if (triggerNavItem) {
    // Build from route staticData - collect left/right button configs
    const floatingConfig = routerState.matches.reduce(
      (acc, match) => {
        const config = match.staticData.floatingNavButtons;
        if (config?.left) acc.left.push(...config.left);
        if (config?.right) acc.right.push(...config.right);
        return acc;
      },
      { left: [] as string[], right: [] as string[] },
    );

    // Dedupe each side
    const leftIds = [...new Set(floatingConfig.left)];
    const rightIds = [...new Set(floatingConfig.right)];

    if (isMobile) {
      // Map left items
      const leftItems = navItems
        .filter((item) => leftIds.includes(item.id))
        .map((item) => ({
          id: item.id,
          icon: item.icon,
          onClick: () => triggerNavItem(item.id),
          direction: 'left' as const,
        }));

      // Map right items
      const rightItems = navItems
        .filter((item) => rightIds.includes(item.id))
        .map((item) => ({
          id: item.id,
          icon: item.icon,
          onClick: () => triggerNavItem(item.id),
          direction: 'right' as const,
        }));

      items = [...leftItems, ...rightItems];
    }
  }

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
