import type { IconComponent } from '~/modules/common/icons/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

export interface FloatingNavItem {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  /** Defaults to true. */
  visible?: boolean;
  /** Defaults to 'right'; with several items the first visible one defaults to 'left'. */
  direction?: 'left' | 'right';
}

interface FloatingNavButtonProps {
  id: string;
  icon: IconComponent;
  onClick: () => void;
  ariaLabel?: string;
  className?: string;
  direction?: 'left' | 'right';
}

export function FloatingNavButton({
  id,
  icon: Icon,
  onClick,
  ariaLabel,
  className,
  direction = 'right',
}: FloatingNavButtonProps) {
  return (
    <Button
      id={id}
      size="icon"
      data-direction={direction}
      variant="secondary"
      onClick={onClick}
      className={cn(
        'fixed bottom-[calc(1rem+var(--bottom-inset,0px))] z-105 flex h-14 w-14 transform items-center justify-center rounded-full bg-secondary opacity-100 shadow-xl transition-all duration-300 ease-in-out hover:bg-secondary active:scale-95 data-[direction=right]:right-4 data-[direction=left]:left-4',
        // Animate out while the floating selection action bar is shown
        'group-[.selection-active]/body:pointer-events-none group-[.selection-active]/body:-bottom-12 group-[.selection-active]/body:scale-50 group-[.selection-active]/body:opacity-0',
        className,
      )}
      aria-label={ariaLabel ?? 'Navigate'}
    >
      <Icon className="icon-xl" />
    </Button>
  );
}
