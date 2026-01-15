import type { LucideProps } from 'lucide-react';
import type React from 'react';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export interface FloatingNavItem {
  id: string;
  icon: React.ElementType<LucideProps>;
  onClick: () => void;
  ariaLabel?: string;
  /** Whether this item should be visible (defaults to true) */
  visible?: boolean;
  /** Button position - defaults to 'right', first visible item defaults to 'left' when multiple items */
  direction?: 'left' | 'right';
}

interface FloatingNavButtonProps {
  id: string;
  icon: React.ElementType<LucideProps>;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  direction?: 'left' | 'right';
}

/**
 * Floating navigation button - a circular FAB-style button.
 */
export const FloatingNavButton = ({
  id,
  icon: Icon,
  onClick,
  ariaLabel,
  className,
  direction = 'right',
}: FloatingNavButtonProps) => {
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
      aria-label={ariaLabel ?? 'Navigate'}
    >
      <Icon size={24} strokeWidth={1.5} />
    </Button>
  );
};
