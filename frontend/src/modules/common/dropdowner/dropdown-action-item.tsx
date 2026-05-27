import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button, type ButtonProps } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface Props {
  isMobile: boolean;
  onSelect?: () => void;
  icon?: LucideIcon;
  children: ReactNode;
  variant?: ButtonProps['variant'];
  className?: ButtonProps['className'];
}

/**
 * Renders a dropdown action as a button or menu item based on viewport.
 */
export function DropdownActionItem({
  isMobile,
  onSelect,
  icon: Icon,
  children,
  variant = 'secondary',
  className,
}: Props) {
  if (isMobile) {
    return (
      <div className="sm:p-1">
        <Button onClick={onSelect} variant={variant} className={cn('flex w-full items-center', className)}>
          {Icon && <Icon size={16} className="mr-2" />}
          {children}
        </Button>
      </div>
    );
  }

  return (
    <button
      role="menuitem"
      type="button"
      onClick={onSelect}
      className={cn(
        'relative flex min-h-10 w-full cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground',
        className,
      )}
    >
      {Icon && <Icon size={16} />}
      <span>{children}</span>
    </button>
  );
}
