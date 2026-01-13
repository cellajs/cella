import { useRouterState } from '@tanstack/react-router';
import type { LucideProps } from 'lucide-react';
import type React from 'react';
import useBodyClass from '~/hooks/use-body-class';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useScrollVisibility } from '~/hooks/use-scroll-visibility';
import type { TriggerNavItemFn } from '~/modules/navigation/types';
import { Button } from '~/modules/ui/button';
import { navItems } from '~/nav-config';
import { cn } from '~/utils/cn';

/**
 * Floating navigation for mobile devices.
 * - Shows/hides buttons based on scroll direction.
 * - Renders buttons defined in route static data.
 */
const FloatingNav = ({ triggerNavItem }: { triggerNavItem: TriggerNavItemFn }) => {
  const routerState = useRouterState();
  const isMobile = useBreakpoints('max', 'sm');
  const { isVisible: showButtons } = useScrollVisibility(isMobile);

  const floatingItems = routerState.matches
    .flatMap((el) => el.staticData.floatingNavButtons || [])
    .filter((id, index, self) => self.indexOf(id) === index); // dedupe

  const items = isMobile ? navItems.filter((item) => floatingItems.includes(item.id)) : [];

  useBodyClass({ 'floating-nav': isMobile && items.length > 0 });

  return (
    <nav id="floating-nav">
      {items.map((navItem, index) => (
        <FloatingNavButton
          key={navItem.id}
          className={showButtons ? 'opacity-100' : 'opacity-0 -bottom-12 scale-50'}
          id={navItem.id}
          icon={navItem.icon}
          onClick={() => triggerNavItem(navItem.id)}
          direction={items.length > 1 && index === 0 ? 'left' : 'right'}
        />
      ))}
    </nav>
  );
};

interface ButtonProps {
  id: string;
  icon: React.ElementType<LucideProps>;
  onClick: () => void;
  className?: string;
  direction?: 'left' | 'right';
}

/**
 * Floating navigation button
 */
export const FloatingNavButton = ({ id, icon: Icon, onClick, className, direction = 'right' }: ButtonProps) => {
  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      className={cn(
        `fixed z-105 w-14 h-14 flex items-center shadow-lg bg-secondary hover:bg-secondary justify-center rounded-full bottom-4 
        transition-all duration-300 ease-in-out transform opacity-100 active:scale-95
        data-[direction=left]:left-4 data-[direction=right]:right-4`,
        className,
      )}
      aria-label="Navigate"
    >
      <Icon size={24} strokeWidth={1.5} />
    </Button>
  );
};

export default FloatingNav;
