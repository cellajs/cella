import { type RefObject, useRef } from 'react';
import { appConfig } from 'shared';
import { useBreakpointBelow } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import { useScrolledPast } from '~/hooks/use-scrolled-past';
import type { IconComponent } from '~/modules/common/icons/types';
import { FloatingNavButton, floatingHiddenClass } from '~/modules/navigation/floating-nav/button';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { cn } from '~/utils/cn';

interface FloatingActionProps {
  icon: IconComponent;
  label: string;
  /** Names the action for a screen reader where the label is short, such as a bare noun. */
  ariaLabel?: string;
  /** Receives the button, which a dialog it opens returns focus to. */
  onClick: (triggerRef: RefObject<HTMLButtonElement | null>) => void;
}

/**
 * A page's main action on a phone: a button floating bottom right, across from the floating menu, that shows its label
 * at the top of the page and hides on a scroll down. One per page; renders nothing from `sm` up.
 */
export function FloatingAction({ icon, label, ariaLabel, onClick }: FloatingActionProps) {
  const isMobile = useBreakpointBelow('sm');
  const { isVisible } = useScrollVisibility(isMobile);
  // iOS overscroll keeps the scroll offset at or below 0, so it counts as the top
  const isAtTop = !useScrolledPast(8, isMobile);
  const floatingNavActive = useNavigationStore((state) => state.floatingNavActive);
  const buttonRef = useRef<HTMLButtonElement>(null);

  if (!isMobile) return null;

  return (
    <FloatingNavButton
      ref={buttonRef}
      id="floating-action"
      icon={icon}
      label={label}
      ariaLabel={ariaLabel}
      labelVisible={isAtTop}
      variant="default"
      onClick={() => onClick(buttonRef)}
      className={cn(
        // Above a bottom nav bar, which the floating menu replaces where it shows
        appConfig.navigation.navBar && !floatingNavActive && 'bottom-[calc(5rem+var(--bottom-inset,0px))]',
        !isVisible && floatingHiddenClass,
      )}
    />
  );
}
